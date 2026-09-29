import { describe, it, expect } from 'vitest';
import { pageChange, responseChange } from '../src/capture/source-change';
import type { BranchSource } from '../src/capture/branch-source';
describe('source change diagnostics', () => {
  it('checks navigation independently of visible DOM identities', () => {
    expect(pageChange('url', 'url')).toBeNull();
    expect(pageChange('private-url', 'private-new')).toEqual({ reason: 'page-url' });
  });
  it('detects branch changes even if rendered content is identical', () => {
    const source: BranchSource = { branch: { currentNode: 'private-tail', nodeIds: ['private-root', 'private-tail'], messageIds: ['private-message'] },
      thinkingIds: [], messages: [{ id: 'private-message', role: 'assistant', parts: [{ type: 'text', text: 'private-body' }] }] };
    expect(responseChange(source, structuredClone(source), 'title', 'title')).toBeNull();
    for (const branch of [{ ...source.branch, currentNode: 'another-tail' }, { ...source.branch, nodeIds: ['different-root', 'private-tail'] },
      { ...source.branch, messageIds: ['another-message'] }]) {
      expect(responseChange(source, { ...source, branch }, 'title', 'title')).toEqual({ reason: 'response-branch' });
    }
    const content = structuredClone(source); content.messages[0]!.parts = [{ type: 'text', text: 'new-body' }];
    expect(responseChange(source, content, 'title', 'title')).toEqual({ reason: 'response-content' });
    expect(responseChange(source, source, 'title', 'new-title')).toEqual({ reason: 'response-title' });
  });
});
