import { stableJson } from '../core/schema';
import type { BranchSource } from './branch-source';

export function pageChange(initialUrl: string, currentUrl: string) {
  return initialUrl !== currentUrl ? { reason: 'page-url' as const } : null;
}

export function responseChange(initial: BranchSource, current: BranchSource, initialTitle: string, currentTitle: string) {
  if (stableJson(initial.branch) !== stableJson(current.branch)) return { reason: 'response-branch' as const };
  if (stableJson(initial.messages) !== stableJson(current.messages)) return { reason: 'response-content' as const };
  if (initialTitle !== currentTitle) return { reason: 'response-title' as const };
  return null;
}
