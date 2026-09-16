// Selectors/history loading informed by TheBluCoder/AI-chat-exporter (MIT),
// pinned and attributed in THIRD_PARTY_NOTICES.md. Updated against live DOM.
import type { Provider } from '../shared/providers';
import type { GraphMessage } from '../shared/message';
import { ProbeError } from '../shared/errors';
import { domMarkdown } from './dom-markdown';
import { stableJson } from '../core/schema';

export type DomProvider = Exclude<Provider, 'chatgpt'>;
const thoughts = 'model-thoughts, .thoughts-container, [data-testid="thinking-block"], [data-testid="thinking-content"]';
const unsupported = 'immersive-entry-chip, immersive-panel, [data-testid="artifact"], [data-testid="artifact-preview"], [aria-label="Preview contents"]';
function fail(code: string, message: string): never { throw new ProbeError(code, message); }
export function domRows(document: Document, provider: DomProvider): Element[] {
  const selector = provider === 'gemini' ? '.conversation-container:has(user-query), message-set:has(user-query)'
    : '[role="feed"] [role="article"]';
  const rows = Array.from(document.querySelectorAll(selector));
  if (!rows.length || rows.length > 20000) fail('PAGE_STRUCTURE_UNSUPPORTED', 'Conversation rows not recognized');
  return rows;
}
export function assertDomReady(document: Document, provider: DomProvider) {
  const stop = provider === 'gemini' ? '[data-test-id="stop-button"], button[aria-label="Stop response"], button[aria-label="停止回答"]'
    : '[data-testid="stop-button"], button[aria-label="Stop response"], button[aria-label="停止回复"]';
  if (document.querySelector(stop)) fail('SOURCE_GENERATING', 'Reply is unfinished');
  if (document.querySelector('[role="feed"] [aria-busy="true"], model-response [aria-busy="true"]')) fail('SOURCE_GENERATING', 'Reply is unfinished');
}
export function readDomConversation(document: Document, provider: DomProvider, includeThinking: boolean): GraphMessage[] {
  assertDomReady(document, provider);
  const rows = domRows(document, provider);
  if (provider === 'claude') {
    const total = Number(rows[0]!.getAttribute('aria-setsize'));
    if (!Number.isSafeInteger(total) || total !== rows.length || rows.some((row, index) =>
      Number(row.getAttribute('aria-posinset')) !== index + 1 || Number(row.getAttribute('aria-setsize')) !== total)) {
      fail('HISTORY_INCOMPLETE', 'Claude message range is incomplete');
    }
  }
  const messages: GraphMessage[] = [];
  const add = (element: Element, id: string, role: 'user' | 'assistant', thinking = false) => {
    const text = domMarkdown(element);
    if (!text) fail('EMPTY_MESSAGE', 'Message content missing');
    messages.push({ id, role, ...(thinking ? { sourceKind: 'thinking' as const } : {}), parts: [{ type: 'text', text }] });
  };
  rows.forEach((row, index) => {
    if (row.querySelector(unsupported)) fail('RICH_CONTENT_UNSUPPORTED', 'Canvas or Artifact requires an adapter');
    // Never export a thumbnail instead of an uploaded document's contents.
    if (row.querySelector('[data-test-id="uploaded-file"]:not(:has(img)), [data-testid="file-thumbnail"]:not(:has(img)), .new-file-preview-file, [data-testid="pasted-text"]')) {
      fail('ATTACHMENT_FORMAT_UNSUPPORTED', 'A non-image attachment needs an adapter');
    }
    const user = row.querySelector(provider === 'gemini' ? 'user-query' : '[data-testid="user-message"]');
    const assistant = row.querySelector(provider === 'gemini' ? 'model-response' : '.font-claude-response');
    if ((!user && !assistant) || (provider === 'claude' && !!user === !!assistant)) fail('PAGE_STRUCTURE_UNSUPPORTED', 'Message role is ambiguous');
    if (user) {
      const content = user.cloneNode(true) as Element;
      if (provider === 'claude') {
        // User images can be siblings of the text bubble (upstream behavior).
        const existing = new Set(Array.from(content.querySelectorAll('img'), image => image.getAttribute('src')));
        row.querySelectorAll('img').forEach(image => { if (!existing.has(image.getAttribute('src'))) content.prepend(image.cloneNode(true)); });
      }
      add(content, `u-${index}`, 'user');
    }
    if (assistant) {
      const reasoning = Array.from(assistant.querySelectorAll(thoughts));
      if (includeThinking) {
        for (const [part, element] of reasoning.entries()) add(element, `t-${index}-${part}`, 'assistant', true);
        // Collapsed, unmounted summaries must not be reported as exported.
        if (!reasoning.length && assistant.querySelector('[data-testid="thinking-button"], .thoughts-header')) fail('THINKING_FORMAT_UNSUPPORTED', 'Thinking content is not loaded');
      }
      const content = assistant.cloneNode(true) as Element;
      content.querySelectorAll(thoughts + ', thinking-overlay, [data-testid="TurnStatus"], [role="status"]').forEach(e => e.remove());
      const blocks = Array.from(content.querySelectorAll(provider === 'gemini' ? 'message-content' : '.standard-markdown, .progressive-markdown'));
      const outer = blocks.filter(block => !blocks.some(other => other !== block && other.contains(block)));
      if (!outer.length) fail('PAGE_STRUCTURE_UNSUPPORTED', 'Answer body missing');
      const body = document.createElement('div'); outer.forEach(block => body.append(block));
      // Images generated outside Markdown are still part of the answer.
      const known = new Set(Array.from(body.querySelectorAll('img'), image => image.getAttribute('src')));
      content.querySelectorAll('img:not([aria-hidden="true"])').forEach(image => { if (!known.has(image.getAttribute('src'))) body.append(image.cloneNode(true)); });
      add(body, `a-${index}`, 'assistant');
    }
  });
  if (messages[0]?.role !== 'user' || messages.at(-1)?.role !== 'assistant') fail('HISTORY_INCOMPLETE', 'Conversation boundaries not confirmed');
  return messages;
}

export function scrollContainer(document: Document, provider: DomProvider): Element {
  const row = domRows(document, provider)[0]!;
  for (let parent = row.parentElement; parent; parent = parent.parentElement) {
    const style = document.defaultView!.getComputedStyle(parent);
    if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return document.scrollingElement ?? document.documentElement;
}

/** Load older turns until both the top boundary and the retained rows settle.
 * Claude also supplies exact aria positions/total; reject virtualization which
 * removes any previously observed row. No fabricated merge across branches. */
export async function loadDomHistory(document: Document, provider: DomProvider, check: () => void,
  pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 900))) {
  const container = scrollContainer(document, provider);
  const originalTop = container.scrollTop;
  const seen = new Set<Element>();
  let previous = ''; let stable = 0;
  try {
    for (let attempt = 0; attempt < 60; attempt++) {
      check(); assertDomReady(document, provider);
      container.scrollTop = 1; container.dispatchEvent(new Event('scroll'));
      container.scrollTop = 0; container.dispatchEvent(new Event('scroll'));
      await pause(); check();
      const rows = domRows(document, provider);
      for (const row of seen) if (!rows.includes(row)) fail('HISTORY_VIRTUALIZED', 'Older messages were removed while loading');
      rows.forEach(row => seen.add(row));
      const signature = stableJson(rows.map(row => ({ id: row.id, text: row.textContent, images: Array.from(row.querySelectorAll('img'), image => image.getAttribute('src')) })));
      const loading = document.querySelector('[role="feed"] [role="progressbar"], #chat-history [role="progressbar"], #chat-history mat-progress-spinner');
      stable = signature === previous && container.scrollTop <= 1 && !loading ? stable + 1 : 0;
      previous = signature;
      if (stable >= 4) return;
    }
    fail('HISTORY_INCOMPLETE', 'History did not settle');
  } finally { container.scrollTop = originalTop; }
}
