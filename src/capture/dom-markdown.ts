import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { ProbeError } from '../shared/errors';

/** Convert a detached copy; never rewrite the user's chat DOM. */
export function domMarkdown(source: Element): string {
  const clone = source.cloneNode(true) as Element;
  const images = Array.from(source.querySelectorAll('img'));
  Array.from(clone.querySelectorAll('img')).forEach((image, index) => {
    const original = images[index]!;
    const url = original.currentSrc || original.getAttribute('src');
    if (!url) throw new ProbeError('IMAGE_REFERENCE_UNSUPPORTED', 'Image source missing');
    image.setAttribute('src', new URL(url, source.ownerDocument.URL).href);
  });
  clone.querySelectorAll('script, style, button:not(:has(img)), [role="toolbar"], .sr-only, .cdk-visually-hidden, .katex-html').forEach(e => e.remove());
  const markdown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', preformattedCode: true });
  // DOM text such as a pasted terminal error may contain literal HTML syntax.
  // Encode before Turndown's Markdown escaping (including ampersands so literal
  // entity strings round-trip). Its escape hook excludes code; our TeX/code
  // rules also read the original node text, so their source stays untouched.
  const escapeMarkdown = markdown.escape.bind(markdown);
  markdown.escape = text => escapeMarkdown(text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  markdown.use(gfm);
  markdown.addRule('math', {
    filter: node => node.nodeType === 1 && (node as Element).matches('.katex, math'),
    replacement: (_content, node) => {
      const element = node as Element;
      const tex = element.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      if (!tex) throw new ProbeError('MATH_FORMAT_UNSUPPORTED', 'Math source missing');
      return element.closest('.katex-display') || element.getAttribute('display') === 'block' ? `\n\n$$\n${tex}\n$$\n\n` : `$${tex}$`;
    },
  });
  markdown.addRule('code', {
    filter: node => node.nodeName === 'PRE' && !!(node as Element).querySelector('code'),
    replacement: (_content, node) => {
      const code = (node as Element).querySelector('code')!;
      const text = code.textContent ?? '';
      const language = /(?:^|\s)language-([\w+-]+)/.exec(code.className)?.[1] ?? '';
      const fence = '`'.repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1)));
      return `\n\n${fence}${language}\n${text.replace(/\n$/, '')}\n${fence}\n\n`;
    },
  });
  // Code controls and language labels surround the pre in both providers.
  clone.querySelectorAll('[role="group"]:has(pre), code-block').forEach(group => {
    const pres = group.querySelectorAll('pre');
    if (pres.length === 1) group.replaceWith(pres[0]!);
  });
  clone.querySelectorAll('a[href]').forEach(link => {
    const url = new URL(link.getAttribute('href')!, source.ownerDocument.URL);
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol) || url.username || url.password) {
      link.removeAttribute('href');
    } else link.setAttribute('href', url.href);
  });
  // Refuse rich content that text conversion would silently discard.
  if (clone.querySelector('iframe, canvas, video, audio, svg:not([aria-hidden="true"])')) throw new ProbeError('RICH_CONTENT_UNSUPPORTED', 'Rich content needs a dedicated adapter');
  clone.querySelectorAll('svg[aria-hidden="true"]').forEach(e => e.remove());
  const text = markdown.turndown(clone as HTMLElement).trim();
  if (text.length > 2 * 1024 * 1024) throw new ProbeError('LIMIT_EXCEEDED', 'Message too large');
  return text;
}
