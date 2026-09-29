import type { BranchSource } from './branch-source';

interface VisibleMessage { id: string; role: 'user' | 'assistant'; }
export interface DomObservation { messages: VisibleMessage[]; unreadable: number; }
export interface DomWitness {
  status: 'unavailable' | 'partial' | 'matched' | 'conflict';
  reason: 'no-message-evidence' | 'unreadable-message-evidence' | 'ordered-subset' | 'tail-matched' | 'message-outside-branch' | 'message-order' | 'message-role';
  observedMessages: number;
  unreadableMessages: number;
}

/** Best-effort witness only. Unsupported layouts never prevent API capture.
 * Keep extraction scoped to the conversation, and never infer roles from text. */
export function readDomObservation(document: Document): DomObservation {
  const root = document.querySelector('#thread') ?? document.querySelector('main');
  const messages: VisibleMessage[] = [];
  let unreadable = 0;
  const seen = new Map<string, VisibleMessage['role']>();
  for (const node of root?.querySelectorAll('[data-message-author-role]') ?? []) {
    const role = node.getAttribute('data-message-author-role');
    const id = node.getAttribute('data-message-id');
    if ((role !== 'user' && role !== 'assistant') || !id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) { unreadable++; continue; }
    const previous = seen.get(id);
    const ancestor = node.parentElement?.closest('[data-message-author-role]');
    if (previous === role && ancestor?.getAttribute('data-message-id') === id && ancestor.getAttribute('data-message-author-role') === role) continue;
    if (previous) return { messages: [], unreadable: unreadable + messages.length + 1 };
    seen.set(id, role);
    messages.push({ id, role });
  }
  return { messages, unreadable };
}

/** Diagnostics contain counts and enums only, never source IDs or text. */
export function verifyDomWitness(observation: DomObservation, source: BranchSource): DomWitness {
  const result = (status: DomWitness['status'], reason: DomWitness['reason']): DomWitness => ({
    status, reason, observedMessages: observation.messages.length, unreadableMessages: observation.unreadable,
  });
  if (!observation.messages.length) return result('unavailable', observation.unreadable ? 'unreadable-message-evidence' : 'no-message-evidence');
  const positions = new Map(source.branch.messageIds.map((id, index) => [id, index]));
  const roles = new Map(source.messages.map(message => [message.id, message.role]));
  let previous = -1;
  for (const message of observation.messages) {
    const position = positions.get(message.id);
    if (position === undefined) return result('conflict', 'message-outside-branch');
    if (position <= previous) return result('conflict', 'message-order');
    if (roles.has(message.id) && roles.get(message.id) !== message.role) return result('conflict', 'message-role');
    previous = position;
  }
  const ordinary = source.messages.filter(message => message.sourceKind !== 'thinking' && message.sourceKind !== 'tool-image');
  const ordinaryIds = new Set(ordinary.map(message => message.id));
  const visibleOrdinary = observation.messages.filter(message => ordinaryIds.has(message.id));
  if (!observation.unreadable && visibleOrdinary.length && visibleOrdinary.at(-1)?.id === ordinary.at(-1)?.id) return result('matched', 'tail-matched');
  return result('partial', observation.unreadable ? 'unreadable-message-evidence' : 'ordered-subset');
}
