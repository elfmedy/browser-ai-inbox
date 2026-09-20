import { describe, it, expect } from 'vitest';
import { pageChange } from '../src/capture/source-change';
describe('source change diagnostics', () => {
  it('accepts stable visible identities', () => {
    expect(pageChange('url', 'url', ['a', 'b'], ['a', 'b'])).toBeNull();
  });
  it('distinguishes navigation from DOM changes without exposing identities', () => {
    expect(pageChange('private-url', 'private-new', ['private-a'], ['private-a'])?.reason).toBe('page-url');
    const change = pageChange('private-url', 'private-url', ['private-a', 'private-b'], ['private-b', 'private-c']);
    expect(change).toMatchObject({ reason: 'visible-messages', addedVisibleCount: 1, removedVisibleCount: 1, initialVisibleCount: 2, currentVisibleCount: 2 });
    expect(JSON.stringify(change)).not.toContain('private');
  });
  it('detects reordering and missing IDs even without added messages', () => {
    expect(pageChange('url', 'url', ['a', 'b'], ['b', 'a'])).toMatchObject({ visibleChanged: true, addedVisibleCount: 0 });
    expect(pageChange('url', 'url', ['a'], [''])).toMatchObject({ missingVisibleIdCount: 1 });
  });
});
