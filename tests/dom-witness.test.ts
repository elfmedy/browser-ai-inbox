import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { readDomObservation, verifyDomWitness } from '../src/capture/dom-witness';
import type { BranchSource } from '../src/capture/branch-source';

const source: BranchSource = {
  branch: { currentNode: 'a2', nodeIds: ['u1', 'a1', 'u2', 'thought', 'a2'], messageIds: ['u1', 'a1', 'u2', 'thought', 'a2'] },
  thinkingIds: ['thought'],
  messages: ['u1', 'a1', 'u2', 'a2'].map(id => ({ id, role: id.startsWith('u') ? 'user' : 'assistant', parts: [{ type: 'text', text: 'synthetic' }] })),
};
function witness(html: string) {
  const dom = new JSDOM(html);
  try { return verifyDomWitness(readDomObservation(dom.window.document), source); } finally { dom.window.close(); }
}
const row = (id: string, role = id.startsWith('u') ? 'user' : 'assistant') => `<div data-message-author-role="${role}" data-message-id="${id}"></div>`;

describe('optional DOM branch witness', () => {
  it('accepts unavailable layouts and missing IDs as absence of evidence', () => {
    expect(witness('<main><h4>New chat layout</h4></main>').status).toBe('unavailable');
    expect(witness('<main><div data-message-author-role="user"></div></main>')).toMatchObject({ status: 'unavailable', unreadableMessages: 1 });
    expect(witness(`<aside>${row('other-chat')}</aside><main></main>`).status).toBe('unavailable');
  });
  it('accepts scrolling between ordered subsets without requiring the tail', () => {
    expect(witness(`<main>${row('u1')}${row('a1')}</main>`).status).toBe('partial');
    expect(witness(`<main>${row('u2')}${row('a2')}</main>`).status).toBe('matched');
    expect(witness('<main></main>').status).toBe('unavailable');
  });
  it('checks thinking IDs against the raw branch even if thinking export is disabled', () => {
    expect(witness(`<main>${row('thought')}</main>`).status).toBe('partial');
    expect(witness(`<main>${row('thought')}${row('a2')}</main>`).status).toBe('matched');
  });
  it('does not let one malformed row hide a reliable conflict', () => {
    expect(witness(`<main><div data-message-author-role="user"></div>${row('other-answer')}</main>`)).toMatchObject({ status: 'conflict', reason: 'message-outside-branch' });
  });
  it('distinguishes identity, ordering and role conflicts without private values', () => {
    expect(witness(`<main>${row('private-other')}</main>`)).toMatchObject({ status: 'conflict', reason: 'message-outside-branch' });
    expect(witness(`<main>${row('a2')}${row('u1')}</main>`)).toMatchObject({ status: 'conflict', reason: 'message-order' });
    expect(witness(`<main>${row('u1', 'assistant')}</main>`)).toMatchObject({ status: 'conflict', reason: 'message-role' });
    expect(JSON.stringify(witness(`<main>${row('private-other')}</main>`))).not.toContain('private');
  });
  it('normalizes nested duplicate wrappers but does not guess ambiguous identities', () => {
    expect(witness(`<main><div data-message-id="a2" data-message-author-role="assistant">${row('a2')}</div></main>`)).toMatchObject({ status: 'matched', observedMessages: 1 });
    expect(witness(`<main>${row('a2')}${row('a2', 'user')}</main>`).status).toBe('unavailable');
  });
});
