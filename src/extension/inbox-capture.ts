import { probeObservedRequest } from '../capture/observed-request';
import { validatedSource, type BranchSource } from '../capture/branch-source';
import { readDomObservation, verifyDomWitness, type DomObservation } from '../capture/dom-witness';
import { imageManifest } from '../render/conversation';
import { expandCitations } from '../render/citations';
import { canonicalizeImages } from '../render/markdown';
import { Snapshot, stableJson, type SnapshotData } from '../core/schema';
import { ProbeError } from '../shared/errors';
import type { CaptureState } from './inbox-types';
import { conversationLocation, type ConversationLocation } from '../shared/providers';
import { assertDomReady, loadDomHistory, readDomConversation, type DomProvider } from '../capture/dom-providers';
import { downloadDomImage } from '../assets/dom-image';
import { pageChange, responseChange } from '../capture/source-change';

const previous = globalThis.aiInboxCapture;
if (!previous || ['success', 'error'].includes(previous.stage) || Date.now() - previous.started > 15 * 60 * 1000) {
  const state: CaptureState = { id: crypto.randomUUID(), pageUrl: location.href, started: Date.now(), stage: 'reading', bytes: {} };
  globalThis.aiInboxCapture = state;
  void capture(state).catch((error: unknown) => {
    state.stage = 'error'; state.code = error instanceof ProbeError ? error.code : 'CAPTURE_FAILED'; state.bytes = {}; delete state.snapshot;
  });
  setTimeout(() => { if (globalThis.aiInboxCapture === state) globalThis.aiInboxCapture = undefined; state.bytes = {}; delete state.snapshot; }, 15 * 60 * 1000);
}
async function capture(state: CaptureState) {
  const source = conversationLocation(state.pageUrl);
  if (source && source.provider !== 'chatgpt') return captureDom(state, source);
  if (!source) throw new ProbeError('UNSUPPORTED_PAGE', 'Open a supported conversation');
  const id = source.id;
  const initialVisible = readDomObservation(document);
  let baseline: BranchSource | undefined;
  state.diagnostics = { adapterVersion: 2, phase: 'reading', httpStatus: null, requestCode: null, validation: null };
  const changed = (change: NonNullable<NonNullable<CaptureState['diagnostics']>['sourceChange']>) => {
    if (state.diagnostics) state.diagnostics.sourceChange = change;
    throw new ProbeError('SOURCE_CHANGED', 'Conversation changed');
  };
  const checkPage = () => {
    const change = pageChange(state.pageUrl, location.href);
    if (change) changed({ ...change, stage: state.stage, elapsedMs: Date.now() - state.started });
    if (document.querySelector('[data-testid="stop-button"]')) throw new ProbeError('SOURCE_GENERATING', 'Reply is unfinished');
    if (Date.now() - state.started > 14 * 60 * 1000) throw new ProbeError('CAPTURE_TIMEOUT', 'Capture timed out');
    if (baseline) checkWitness(readDomObservation(document), 'current');
  };
  const checkWitness = (observation: DomObservation, phase: 'initial' | 'current') => {
    if (!baseline || !state.diagnostics) return;
    const witness = verifyDomWitness(observation, baseline);
    state.diagnostics.branchVerification ??= { source: 'api', apiRecheck: 'pending' };
    state.diagnostics.branchVerification[phase] = witness;
    if (witness.status === 'conflict') throw new ProbeError('VISIBLE_CHAIN_MISMATCH', 'Page messages conflict with the API branch');
  };
  checkPage();
  const includeThinking = globalThis.aiInboxCaptureOptions?.includeThinking === true;
  let pageDiagnostics: NonNullable<CaptureState['diagnostics']>['page'];
  const request = () => {
    pageDiagnostics = { readyState: document.readyState, ageMs: Math.round(performance.now()), visibility: document.visibilityState,
      visibleMessages: readDomObservation(document).messages.length, navigationType: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? 'unknown' };
    return probeObservedRequest({ pageUrl: state.pageUrl, enableToolImages: true, includeThinking,
    scripts: Array.from(document.scripts, script => script.textContent ?? ''),
    resources: performance.getEntriesByType('resource').filter((entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming)
      .map(entry => ({ name: entry.name, initiatorType: entry.initiatorType })),
    });
  };
  const sourceMessages = (result: Awaited<ReturnType<typeof request>>, phase: 'reading' | 'checking' = 'reading'): BranchSource => {
    state.diagnostics = { adapterVersion: 2, phase, httpStatus: result.diagnostics.httpStatus,
      ...(state.diagnostics?.branchVerification ? { branchVerification: state.diagnostics.branchVerification } : {}),
      discovery: result.diagnostics.discovery, ...(pageDiagnostics ? { page: pageDiagnostics } : {}),
      request: { selection: result.diagnostics.selection, authSource: result.diagnostics.authSource,
        sessionHttpStatus: result.diagnostics.sessionHttpStatus, requestedTurnLimit: result.diagnostics.requestedTurnLimit, pagination: result.diagnostics.pagination },
      requestCode: result.diagnostics.error, validation: result.messageList?.diagnostics ?? null };
    return validatedSource(result, id, includeThinking);
  };
  const first = await request(); baseline = sourceMessages(first);
  const messages = baseline.messages;
  checkWitness(initialVisible, 'initial');
  checkPage();
  // Expand references once per message, preserving code/TeX and source order.
  const expanded = messages.map(message => {
    let lastText = -1; message.parts.forEach((part, index) => { if (part.type === 'text') lastText = index; });
    return { id: message.id, role: message.role, ...(message.sourceKind === 'thinking' ? { kind: 'thinking' as const } : {}), parts: message.parts.map((part, index) => part.type === 'text'
      ? { ...part, text: expandCitations(part.text, message.contentReferences, index === lastText) } : part) };
  });
  const manifest = imageManifest(expanded); const digests = new Map<string, string>();
  if (manifest.length > 1000) throw new ProbeError('LIMIT_EXCEEDED', 'Too many images');
  state.stage = 'images'; state.count = 0; state.total = manifest.length;
  let byteLength = 0; const assets: SnapshotData['assets'] = [];
  for (const image of manifest) {
    checkPage(); if (!first.downloadImage) throw new ProbeError('IMAGE_RESOLVER_UNAVAILABLE', 'Image resolver unavailable');
    const downloaded = await first.downloadImage(image.reference);
    const bitmap = await createImageBitmap(new Blob([downloaded.bytes.slice().buffer], { type: downloaded.mime })); bitmap.close();
    const digest = await crypto.subtle.digest('SHA-256', downloaded.bytes.slice().buffer);
    const sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    digests.set(image.reference, sha256);
    if (!state.bytes[sha256]) {
      byteLength += downloaded.bytes.length; if (byteLength > 250 * 1024 * 1024) throw new ProbeError('LIMIT_EXCEEDED', 'Images exceed total budget');
      state.bytes[sha256] = downloaded.bytes;
      assets.push({ sha256, mime: downloaded.mime, byteLength: downloaded.bytes.length });
    }
    state.count++;
  }
  state.stage = 'checking'; checkPage();
  const final = await request();
  const change = responseChange(baseline, sourceMessages(final, 'checking'), first.sourceTitle, final.sourceTitle);
  if (state.diagnostics?.branchVerification) state.diagnostics.branchVerification.apiRecheck = change ? 'changed' : 'unchanged';
  if (change) changed({ ...change, stage: state.stage, elapsedMs: Date.now() - state.started });
  checkPage();
  state.snapshot = Snapshot.parse({ schemaVersion: 1, conversationId: id, sourceUrl: `https://chatgpt.com/c/${id}`,
    title: first.sourceTitle || document.title.replace(/\s*[-|]\s*ChatGPT$/, ''), capturedAt: new Date().toISOString(),
    messages: expanded.map(message => ({ ...message, parts: message.parts.map(part => part.type === 'text'
      ? { type: 'text', text: canonicalizeImages(part.text, digests) }
      : { type: 'image', sha256: digests.get(part.pointer), ...(part.alt ? { alt: part.alt } : {}) }) })), assets });
  state.stage = 'success';
}

async function captureDom(state: CaptureState, source: ConversationLocation) {
  const provider = source.provider as DomProvider;
  const includeThinking = globalThis.aiInboxCaptureOptions?.includeThinking === true;
  state.diagnostics = { adapterVersion: 2, provider, phase: 'reading', httpStatus: null, requestCode: null, validation: null };
  const check = () => {
    if (location.href !== state.pageUrl) throw new ProbeError('SOURCE_CHANGED', 'Conversation changed');
    if (Date.now() - state.started > 14 * 60 * 1000) throw new ProbeError('CAPTURE_TIMEOUT', 'Capture timed out');
    assertDomReady(document, provider);
  };
  await loadDomHistory(document, provider, check);
  const messages = readDomConversation(document, provider, includeThinking);
  state.diagnostics.dom = { messages: messages.length, history: 'settled-at-top' };
  const title = document.title.replace(/\s*[-|]\s*(?:Google Gemini|Gemini|Claude)$/, '').slice(0, 512);
  const manifest = imageManifest(messages); const digests = new Map<string, string>();
  if (manifest.length > 1000) throw new ProbeError('LIMIT_EXCEEDED', 'Too many images');
  state.stage = 'images'; state.count = 0; state.total = manifest.length;
  let total = 0; const assets: SnapshotData['assets'] = [];
  for (const image of manifest) {
    check(); const downloaded = await downloadDomImage(image.reference, location.origin);
    const bitmap = await createImageBitmap(new Blob([downloaded.bytes.slice().buffer], { type: downloaded.mime })); bitmap.close();
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', downloaded.bytes.slice().buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
    digests.set(image.reference, sha256);
    if (!state.bytes[sha256]) {
      total += downloaded.bytes.length; if (total > 250 * 1024 * 1024) throw new ProbeError('LIMIT_EXCEEDED', 'Images exceed total budget');
      state.bytes[sha256] = downloaded.bytes; assets.push({ sha256, mime: downloaded.mime, byteLength: downloaded.bytes.length });
    }
    state.count++;
  }
  state.stage = 'checking'; state.diagnostics.phase = 'checking'; check();
  if (stableJson(readDomConversation(document, provider, includeThinking)) !== stableJson(messages) ||
    document.title.replace(/\s*[-|]\s*(?:Google Gemini|Gemini|Claude)$/, '').slice(0, 512) !== title) throw new ProbeError('SOURCE_CHANGED', 'Conversation changed while downloading images');
  state.snapshot = Snapshot.parse({ schemaVersion: 1, provider, conversationId: source.id, sourceUrl: source.url, title, capturedAt: new Date().toISOString(),
    messages: messages.map(message => ({ id: message.id, role: message.role, ...(message.sourceKind === 'thinking' ? { kind: 'thinking' } : {}),
      parts: message.parts.map(part => part.type === 'text' ? { type: 'text', text: canonicalizeImages(part.text, digests) }
        : { type: 'image', sha256: digests.get(part.pointer), alt: part.alt ?? '' }) })), assets });
  state.stage = 'success';
}
