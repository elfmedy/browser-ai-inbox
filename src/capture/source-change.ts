export function pageChange(initialUrl: string, currentUrl: string, initial: string[], current: string[]) {
  const urlChanged = initialUrl !== currentUrl;
  const visibleChanged = initial.length !== current.length || initial.some((id, index) => id !== current[index]);
  if (!urlChanged && !visibleChanged) return null;
  const before = new Set(initial); const after = new Set(current);
  return { reason: urlChanged ? 'page-url' as const : 'visible-messages' as const,
    urlChanged, visibleChanged, initialVisibleCount: initial.length, currentVisibleCount: current.length,
    addedVisibleCount: current.filter(id => !before.has(id)).length,
    removedVisibleCount: initial.filter(id => !after.has(id)).length,
    missingVisibleIdCount: current.filter(id => !id).length };
}
