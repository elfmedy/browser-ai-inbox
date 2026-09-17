import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import { domMarkdown } from '../src/capture/dom-markdown';
import { loadDomHistory, readDomConversation } from '../src/capture/dom-providers';
import { imageManifest, renderConversation } from '../src/render/conversation';
import { inspectMarkdown } from '../src/render/markdown';
import { fromMarkdown } from 'mdast-util-from-markdown';

function page(html: string, provider = 'gemini') {
  return new JSDOM(html, { url: provider === 'gemini' ? 'https://gemini.google.com/app/test' : 'https://claude.ai/chat/test' }).window.document;
}
const gemini = `<div id="chat-history"><div class="conversation-container" id="turn-1"><user-query><user-query-content><h5 class="cdk-visually-hidden">You said truncated</h5><p>Full prompt</p><button>Copy</button><img src="https://lh3.googleusercontent.com/fixture.png" alt="Upload"></user-query-content></user-query><model-response><message-content><p>Full answer <b>bold</b></p><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></message-content></model-response></div></div>`;
const claude = `<div role="feed"><div role="article" aria-setsize="2" aria-posinset="1"><div data-testid="user-message"><p>Prompt</p></div></div><div role="article" aria-setsize="2" aria-posinset="2"><div class="font-claude-response"><div class="prose"><div class="standard-markdown"><p>Introduction</p></div></div><div data-testid="TurnStatus"><button aria-expanded="false">Searched web</button><p>Private tool log</p></div><div class="prose"><div class="standard-markdown"><p>Answer <a href="https://example.com/source">source</a></p><div role="group"><button>Copy</button><div>powershell</div><pre><code class="language-powershell">Write-Host 'test'\n</code></pre></div></div></div></div></div></div>`;
describe('Gemini and Claude DOM adapters', () => {
  it('saves Claude terminal errors containing HTML-looking text through manifest and note rendering', () => {
    const html = claude.replace('<p>Prompt</p>', '<p>Shell error<br>+ ... anonymous"/&gt;&lt;script type="text/javascript"&gt;example() ...<br>+ ~<br>Final error line</p>');
    const messages = readDomConversation(page(html, 'claude'), 'claude', false);
    expect(messages).toHaveLength(2);
    expect(() => imageManifest(messages)).not.toThrow();
    const note = renderConversation({ title: 'Terminal error', sourceUrl: 'https://claude.ai/chat/test', messages, assets: new Map() });
    expect(note).toContain('&lt;script type="text/javascript"&gt;example()');
    expect(note).toContain('Final error line'); expect(note).toContain('Introduction');
    expect(inspectMarkdown(note).images).toEqual([]);
  });
  it('preserves literal entities and angle brackets in prose without altering code or TeX', () => {
    const literal = '<script>alert(1)</script> <img src="https://example.com/fake.png"> <!-- text --> &amp; &#60; &copy; > end';
    const document = page('<div id="body"><p id="literal"></p><code>&lt;b&gt;&amp;amp;&lt;/b&gt;</code><pre><code class="language-html">&lt;script&gt;example()&lt;/script&gt;</code></pre><span class="katex"><math><semantics><annotation encoding="application/x-tex">a &lt; b</annotation></semantics></math></span></div>');
    document.querySelector('#literal')!.textContent = literal;
    const result = domMarkdown(document.querySelector('#body')!);
    expect(inspectMarkdown(result).images).toEqual([]);
    const paragraph = fromMarkdown(result).children[0]!;
    expect(paragraph.type).toBe('paragraph');
    if (paragraph.type !== 'paragraph') throw Error('Expected paragraph');
    expect(paragraph.children).toEqual([expect.objectContaining({ type: 'text', value: literal })]);
    expect(result).toContain('`<b>&amp;</b>`');
    expect(result).toContain('```html\n<script>example()</script>\n```');
    expect(result).toContain('$a < b$');
  });
  it('reads the current Gemini container, complete collapsed prompt, images and table', () => {
    const messages = readDomConversation(page(gemini), 'gemini', false);
    expect(messages).toHaveLength(2);
    expect(messages[0]!.parts).toEqual([{ type: 'text', text: 'Full prompt\n\n![Upload](https://lh3.googleusercontent.com/fixture.png)' }]);
    expect(JSON.stringify(messages)).not.toMatch(/Copy|truncated/);
    expect(JSON.stringify(messages)).toContain('| A | B |');
  });
  it('preserves all Claude answer blocks around tool UI, code language and citations', () => {
    const messages = readDomConversation(page(claude, 'claude'), 'claude', false);
    expect(messages.map(m => m.role)).toEqual(['user', 'assistant']);
    const answer = messages[1]!.parts[0]!; expect(answer.type).toBe('text');
    if (answer.type !== 'text') throw Error('text');
    expect(answer.text).toContain('Introduction'); expect(answer.text).toContain('[source](https://example.com/source)');
    expect(answer.text).toContain("```powershell\nWrite-Host 'test'\n```");
    expect(answer.text).not.toMatch(/Private tool|Searched web|Copy/);
  });
  it('refuses partial, out-of-order or unknown Claude ranges', () => {
    for (const html of [claude.replaceAll('aria-setsize="2"', 'aria-setsize="3"'), claude.replace('aria-posinset="1"', 'aria-posinset="2"'), claude.replaceAll('aria-setsize="2"', '')]) {
      expect(() => readDomConversation(page(html, 'claude'), 'claude', false)).toThrow('incomplete');
    }
  });
  it('does not silently skip Canvas, documents, unfinished replies or missing bodies', () => {
    for (const extra of ['<immersive-entry-chip>Canvas</immersive-entry-chip>', '<div data-test-id="uploaded-file">PDF</div>', '<span aria-busy="true">Loading</span>']) {
      expect(() => readDomConversation(page(gemini.replace('<message-content>', extra + '<message-content>')), 'gemini', false)).toThrow();
    }
    expect(() => readDomConversation(page(gemini.replaceAll('message-content', 'unknown-content')), 'gemini', false)).toThrow('body');
  });
  it('applies thinking preference to a recognized expanded or CSS-collapsed summary', () => {
    for (const style of ['', 'display:none']) {
      const html = gemini.replace('<message-content>', `<model-thoughts style="${style}"><p>Reasoning summary</p></model-thoughts><message-content>`);
      expect(JSON.stringify(readDomConversation(page(html), 'gemini', false))).not.toContain('Reasoning summary');
      expect(readDomConversation(page(html), 'gemini', true).filter(m => m.sourceKind === 'thinking')).toHaveLength(1);
    }
  });
  it('restores scroll after loading and refuses disappearing/virtualized history', async () => {
    const document = page(gemini); vi.stubGlobal('Event', document.defaultView!.Event);
    try {
      let checks = 0;
      await loadDomHistory(document, 'gemini', () => { checks++; }, async () => undefined);
      expect(checks).toBeGreaterThanOrEqual(10);
      let loops = 0;
      await expect(loadDomHistory(document, 'gemini', () => undefined, async () => {
        if (++loops === 2) { const row = document.querySelector('.conversation-container')!; row.replaceWith(row.cloneNode(true)); }
      })).rejects.toMatchObject({ code: 'HISTORY_VIRTUALIZED' });
    } finally { vi.unstubAllGlobals(); }
  });
  it('preserves TeX and chooses safe fences for code containing backticks', () => {
    const document = page('<div id="body"><span class="katex"><math><semantics><annotation encoding="application/x-tex">x^2</annotation></semantics></math><span class="katex-html">duplicate</span></span><pre><code>```\ncode\n```</code></pre></div>');
    const result = domMarkdown(document.querySelector('#body')!);
    expect(result).toContain('$x^2$'); expect(result).not.toContain('duplicate'); expect(result).toContain('````\n```\ncode\n```\n````');
  });
});
