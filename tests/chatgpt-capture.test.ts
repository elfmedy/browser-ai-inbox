import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeGraph } from './fixtures/graph';
import { diagnosticText } from '../src/extension/inbox-diagnostics';

const url = 'https://chatgpt.com/c/synthetic-conversation';
const row = (id: string, role = 'assistant') => `<div data-message-author-role="${role}" data-message-id="${id}"></div>`;
const list = () => {
  const graph = makeGraph();
  return { conversation_id: 'synthetic-conversation', current_node: graph.current_node,
    messages: Object.values(graph.mapping).filter(node => node.message).map(node => node.message),
    page_info: { start_cursor: 'm0', end_cursor: 'm3', has_previous_page: false, has_next_page: false } };
};
let dom: JSDOM;
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  dom = new JSDOM('<!doctype html><main></main>', { url });
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('location', dom.window.location);
  vi.stubGlobal('PerformanceResourceTiming', class {});
  globalThis.aiInboxCapture = undefined;
  globalThis.aiInboxCaptureOptions = { includeThinking: false };
});
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
  globalThis.aiInboxCapture = undefined; globalThis.aiInboxCaptureOptions = undefined;
  dom.window.close();
});

async function capture(respond: (call: number) => unknown) {
  let call = 0;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
    const data = respond(++call);
    const response = new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    Object.defineProperty(response, 'url', { value: String(input) });
    return response;
  });
  vi.stubGlobal('fetch', fetcher);
  await import('../src/extension/inbox-capture');
  await vi.waitFor(() => expect(['success', 'error']).toContain(globalThis.aiInboxCapture?.stage));
  return { state: globalThis.aiInboxCapture!, fetcher };
}

describe('ChatGPT capture through the API pipeline', () => {
  it('adapts presentation components and citations before the final API recheck and snapshot', async () => {
    const graph = makeGraph();
    graph.mapping.m3.message.content.parts = ['<box border radius="lg">\n  **Result**\n  <row>\n    <icon name="arrow-down"/>\n  </row>\n  <text size="xs">Claim <Cite ref="turn0search0"/></text>\n\n  ```html\n  <box>literal code</box>\n  ```\n</box>'];
    const { state, fetcher } = await capture(() => graph);
    expect(state.stage).toBe('success');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state.diagnostics?.branchVerification?.apiRecheck).toBe('unchanged');
    const part = state.snapshot?.messages[3]?.parts[0];
    expect(part?.type).toBe('text');
    if (part?.type !== 'text') throw new Error('Expected a Markdown snapshot');
    expect(part.text).toContain('**Result**'); expect(part.text).toContain('↓');
    expect(part.text).toContain('引用未解析');
    expect(part.text).toContain('```html\n<box>literal code</box>\n```');
    expect(part.text).not.toContain('<row>');
  });
  it('still rejects changes to the source layout before saving', async () => {
    const { state } = await capture(call => {
      const graph = makeGraph();
      graph.mapping.m3.message.content.parts = [`<box gap={${call}}>\n  Same text\n</box>`];
      return graph;
    });
    expect(state.code).toBe('SOURCE_CHANGED');
    expect(state.snapshot).toBeUndefined();
  });
  it.each(['graph', 'list'])('succeeds with no DOM witness using a validated %s source', async kind => {
    const { state, fetcher } = await capture(() => kind === 'graph' ? makeGraph() : list());
    expect(state.stage).toBe('success');
    expect(state.snapshot?.messages).toHaveLength(4);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state.diagnostics?.branchVerification).toMatchObject({ source: 'api', apiRecheck: 'unchanged',
      initial: { status: 'unavailable' }, current: { status: 'unavailable' } });
    const report = diagnosticText({ stage: state.stage, diagnostics: state.diagnostics! }, 'test');
    expect(report).not.toContain('synthetic-conversation');
    expect(report).not.toContain('m3');
    expect(report).not.toContain('合成测试消息');
  });
  it('accepts a new DOM layout without needing an additional selector adapter', async () => {
    dom.window.document.body.innerHTML = '<div data-chatgpt-conversation-selection-target="true"><div data-chatgpt-search-message-ids="m3 m3">Answer</div></div>';
    const { state } = await capture(list);
    expect(state.stage).toBe('success');
  });
  it('accepts partial witnesses, virtualization and missing-ID wrappers', async () => {
    dom.window.document.body.innerHTML = `<main>${row('m0', 'user')}<div data-message-author-role="assistant"></div></main>`;
    const { state } = await capture(call => {
      dom.window.document.querySelector('main')!.innerHTML = call === 1 ? row('m2', 'user') : '';
      return list();
    });
    expect(state.stage).toBe('success');
    expect(state.diagnostics?.branchVerification).toMatchObject({ initial: { status: 'partial' }, current: { status: 'unavailable' } });
  });
  it.each(['initial', 'first-response', 'final-response'])('rejects a reliable DOM conflict at %s', async phase => {
    if (phase === 'initial') dom.window.document.querySelector('main')!.innerHTML = row('other-branch');
    const { state } = await capture(call => {
      if ((phase === 'first-response' && call === 1) || (phase === 'final-response' && call === 2)) {
        dom.window.document.querySelector('main')!.innerHTML = row('other-branch');
      }
      return list();
    });
    expect(state.code).toBe('VISIBLE_CHAIN_MISMATCH');
    expect(state.snapshot).toBeUndefined();
  });
  it('does not turn malformed API data into DOM-only success', async () => {
    dom.window.document.querySelector('main')!.innerHTML = row('m3');
    const { state, fetcher } = await capture(() => { const graph = makeGraph(); delete graph.mapping.m1; return graph; });
    expect(state.code).toBe('MISSING_PARENT');
    expect(state.snapshot).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects a failed API recheck instead of submitting the initial snapshot', async () => {
    const { state } = await capture(call => {
      const data = list();
      if (call === 2) data.page_info.end_cursor = 'wrong';
      return data;
    });
    expect(state.stage).toBe('error');
    expect(state.snapshot).toBeUndefined();
    expect(state.diagnostics?.phase).toBe('checking');
  });
  it('rejects duplicate hidden graph message identities', async () => {
    const { state } = await capture(() => {
      const graph = makeGraph();
      graph.mapping.hidden = { id: 'hidden', parent: 'm3', children: [],
        message: { id: 'm3', author: { role: 'system' }, content: { content_type: 'text', parts: ['hidden'] } } };
      graph.mapping.m3.children = ['hidden']; graph.current_node = 'hidden';
      return graph;
    });
    expect(state.code).toBe('DUPLICATE_MESSAGE_ID');
    expect(state.snapshot).toBeUndefined();
  });
  it.each(['identity', 'coverage', 'generating', 'unknown-content', 'duplicate'])('still rejects invalid API %s without DOM', async failure => {
    const { state } = await capture(() => {
      const data = list();
      if (failure === 'identity') data.conversation_id = 'other-chat';
      if (failure === 'coverage') data.page_info.end_cursor = 'wrong';
      if (failure === 'generating') data.messages[3].status = 'in_progress';
      if (failure === 'unknown-content') data.messages[3].content.content_type = 'unknown-format';
      if (failure === 'duplicate') data.messages[2].id = 'm1';
      return data;
    });
    expect(state.stage).toBe('error');
    expect(state.snapshot).toBeUndefined();
  });
  it('detects hidden list branch changes even when exported messages stay identical', async () => {
    const { state } = await capture(call => {
      const data = list();
      const hidden = { id: `hidden-${call}`, author: { role: 'system' }, content: { content_type: 'text', parts: ['hidden'] } };
      data.messages.push(hidden); data.current_node = hidden.id; data.page_info.end_cursor = hidden.id;
      return data;
    });
    expect(state.code).toBe('SOURCE_CHANGED');
    expect(state.diagnostics?.sourceChange?.reason).toBe('response-branch');
    expect(state.diagnostics?.branchVerification?.apiRecheck).toBe('changed');
    expect(state.snapshot).toBeUndefined();
  });
  it('detects graph node changes when the message IDs and text stay identical', async () => {
    const { state } = await capture(call => {
      const graph = makeGraph();
      if (call === 2) {
        graph.mapping.alternate = { ...graph.mapping.m3, id: 'alternate' };
        graph.mapping.m2.children = ['alternate']; graph.current_node = 'alternate'; delete graph.mapping.m3;
      }
      return graph;
    });
    expect(state.code).toBe('SOURCE_CHANGED');
    expect(state.diagnostics?.sourceChange?.reason).toBe('response-branch');
    expect(state.snapshot).toBeUndefined();
  });
  it.each(['content', 'title', 'url'])('detects %s changes before producing a snapshot', async change => {
    const { state } = await capture(call => {
      const graph = { ...makeGraph(), title: 'Original' };
      if (call === 2) {
        if (change === 'content') graph.mapping.m3.message.content.parts = ['Changed'];
        if (change === 'title') graph.title = 'Changed';
        if (change === 'url') dom.reconfigure({ url: 'https://chatgpt.com/c/other' });
      }
      return graph;
    });
    expect(state.code).toBe('SOURCE_CHANGED');
    expect(state.diagnostics?.sourceChange?.reason).toBe(change === 'url' ? 'page-url' : `response-${change}`);
    expect(state.snapshot).toBeUndefined();
  });
});
