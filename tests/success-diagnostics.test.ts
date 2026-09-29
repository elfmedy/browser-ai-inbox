import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXPORT_OPTIONS } from '../src/shared/export-options';
import type { CaptureDiagnostics, Feedback, Job } from '../src/extension/inbox-types';

const mocks = vi.hoisted(() => ({ receiver: vi.fn(), jobStore: vi.fn(), selectVault: vi.fn(), queuedFor: vi.fn() }));
vi.mock('../src/extension/inbox-connection', () => ({ receiver: mocks.receiver }));
vi.mock('../src/extension/inbox-vaults', () => ({ selectVault: mocks.selectVault, vaultOverview: vi.fn() }));
vi.mock('../src/extension/inbox-storage', () => ({ jobStore: mocks.jobStore, queuedFor: mocks.queuedFor }));
const diagnostics: CaptureDiagnostics = { adapterVersion: 2, phase: 'checking', httpStatus: 200, requestCode: null, validation: null,
  branchVerification: { source: 'api', apiRecheck: 'unchanged', current: { status: 'unavailable', reason: 'no-message-evidence', observedMessages: 0, unreadableMessages: 0 } } };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); globalThis.aiInboxCapture = undefined; globalThis.aiInboxCaptureOptions = undefined; });

describe('successful capture diagnostics', () => {
  it('retains diagnostics locally through submission without adding them to the receiver protocol', async () => {
    vi.resetModules();
    const url = 'https://chatgpt.com/c/synthetic-conversation';
    let click: ((tab: { id: number; url: string }) => void) | undefined;
    let final: Feedback | undefined;
    mocks.selectVault.mockResolvedValue({ connection: { vaultId: 'vault', endpoint: 'local', token: 'private-token' }, vaultName: 'private-vault' });
    mocks.queuedFor.mockResolvedValue(undefined); mocks.jobStore.mockResolvedValue(undefined);
    mocks.receiver.mockImplementation(async (_connection, path, options) => {
      if (path.endsWith('export-options')) return DEFAULT_EXPORT_OPTIONS;
      if (path.startsWith('v1/conversations/')) return { revision: 0 };
      if (path === 'v1/save') {
        const request = JSON.parse(options.body);
        expect(request.diagnostics).toBeUndefined();
        expect(request.snapshot.branchVerification).toBeUndefined();
        return { requestId: request.requestId, action: 'created', path: 'AI Inbox/Test.md', noteId: crypto.randomUUID(), revision: 1, messages: 1, images: 0 };
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('location', { href: url });
    vi.stubGlobal('chrome', {
      action: { onClicked: { addListener: (listener: typeof click) => { click = listener; } } },
      contextMenus: { onClicked: { addListener: vi.fn() } },
      runtime: { id: 'extension', onMessage: { addListener: vi.fn() }, onInstalled: { addListener: vi.fn() }, onStartup: { addListener: vi.fn() } },
      storage: { local: { get: vi.fn(async () => ({})), set: vi.fn(async (data: { lastStatus?: Feedback }) => { if (data.lastStatus) final = data.lastStatus; }) }, onChanged: { addListener: vi.fn() } },
      tabs: { get: vi.fn(async () => ({ url })), sendMessage: vi.fn() },
      scripting: { executeScript: vi.fn(async (input: { files?: string[]; func?: (...args: unknown[]) => unknown; args?: unknown[] }) => {
        if (input.files?.includes('inbox-capture.js')) {
          globalThis.aiInboxCapture = { id: 'capture', pageUrl: url, started: Date.now(), stage: 'success', bytes: {}, diagnostics,
            snapshot: { schemaVersion: 1, conversationId: 'synthetic-conversation', sourceUrl: url, title: 'Synthetic', capturedAt: new Date().toISOString(),
              messages: [{ id: 'synthetic-message', role: 'assistant', parts: [{ type: 'text', text: 'Synthetic answer' }] }], assets: [] } };
        }
        return [{ result: input.func?.(...(input.args ?? [])) }];
      }) },
    });
    await import('../src/extension/inbox-background');
    click!({ id: 1, url });
    await vi.waitFor(() => expect(final?.stage).toBe('success'));
    expect(final?.diagnostics).toEqual(diagnostics);
    const saved = mocks.jobStore.mock.calls.find(call => call[1] === 'put')?.[2] as Job;
    expect(saved.diagnostics).toEqual(diagnostics);
    expect(saved.request).not.toHaveProperty('diagnostics');
  });
  it('makes successful verification evidence available from the existing status page', async () => {
    vi.resetModules();
    const dom = new JSDOM(readFileSync(new URL('../src/extension/status.html', import.meta.url), 'utf8'), { url: 'https://extension.test/status.html' });
    try {
      vi.stubGlobal('document', dom.window.document); vi.stubGlobal('location', dom.window.location);
      vi.stubGlobal('chrome', { storage: { local: { get: async () => ({ lastStatus: { stage: 'success', diagnostics }, preferences: { language: 'en' } }) },
        onChanged: { addListener: vi.fn() } }, runtime: { getManifest: () => ({ version: 'test' }) } });
      await import('../src/extension/inbox-status');
      await vi.waitFor(() => expect(dom.window.document.getElementById('diagnostics')!.hidden).toBe(false));
      expect(dom.window.document.getElementById('copy')!.hidden).toBe(false);
      expect(dom.window.document.getElementById('diagnostics-text')!.textContent).toContain('no-message-evidence');
      expect(dom.window.document.getElementById('diagnostics-text')!.textContent).not.toContain('private');
    } finally { dom.window.close(); }
  });
});
