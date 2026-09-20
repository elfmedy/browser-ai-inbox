import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
function setup(url: string, language = 'zh', preferred = 'en-US') {
  const dom = new JSDOM('<p id="message"></p><button id="settings"></button>');
  const close = vi.fn(); const sendMessage = vi.fn(async () => ({ accepted: true })); const create = vi.fn();
  vi.stubGlobal('document', dom.window.document); vi.stubGlobal('window', { close });
  vi.stubGlobal('navigator', { language: preferred, languages: [preferred] });
  vi.stubGlobal('chrome', { tabs: { query: async () => [{ id: 1, url }], create },
    storage: { local: { get: async () => ({ preferences: { language } }) } },
    i18n: { getUILanguage: () => 'en' }, runtime: { sendMessage, openOptionsPage: vi.fn() } });
  return { document: dom.window.document, close, sendMessage, create };
}
describe('toolbar popup routing', () => {
  it.each(['chrome://extensions/', 'edge://settings/', 'https://example.com/'])('explains unsupported %s without creating a tab or starting a save', async url => {
    const state = setup(url); await import('../src/extension/inbox-popup');
    await vi.waitFor(() => expect(state.document.querySelector('#message')?.textContent).toContain('普通聊天'));
    expect(state.sendMessage).not.toHaveBeenCalled(); expect(state.create).not.toHaveBeenCalled(); expect(state.close).not.toHaveBeenCalled();
  });
  it.each(['https://chatgpt.com/', 'https://gemini.google.com/app', 'https://claude.ai/new'])('explains the empty conversation on %s in preferred Chinese despite English browser UI', async url => {
    const state = setup(url, 'auto', 'zh-CN'); await import('../src/extension/inbox-popup');
    await vi.waitFor(() => expect(state.document.querySelector('#message')?.textContent).toContain('请先选择一段已有对话'));
    expect(state.sendMessage).not.toHaveBeenCalled();
  });
  it('respects an explicit English choice with Chinese preferred language', async () => {
    const state = setup('https://chatgpt.com/', 'en', 'zh-CN'); await import('../src/extension/inbox-popup');
    await vi.waitFor(() => expect(state.document.querySelector('#message')?.textContent).toContain('Select an existing conversation'));
  });
  it.each(['https://chatgpt.com/c/test', 'https://gemini.google.com/app/test', 'https://claude.ai/chat/test'])('starts saving %s with one click and closes the popup', async url => {
    const state = setup(url); await import('../src/extension/inbox-popup');
    await vi.waitFor(() => expect(state.close).toHaveBeenCalledOnce());
    expect(state.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'save-active' }); expect(state.create).not.toHaveBeenCalled();
  });
});
