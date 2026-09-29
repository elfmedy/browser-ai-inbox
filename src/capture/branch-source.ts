import { verifyCurrentPath, type GraphMessage } from './graph';
import type { probeObservedRequest } from './observed-request';
import { ProbeError, requireRecord } from '../shared/errors';

export interface BranchIdentity {
  currentNode: string;
  nodeIds: string[];
  messageIds: string[];
}
export interface BranchSource {
  messages: GraphMessage[];
  branch: BranchIdentity;
  thinkingIds: string[];
}

/** Keep raw branch identities even when internal messages are omitted from the note. */
export function validatedSource(result: Awaited<ReturnType<typeof probeObservedRequest>>, id: string, includeThinking: boolean): BranchSource {
  if (result.diagnostics.error) {
    const code = result.diagnostics.error === 'CURRENT_CHAT_MESSAGE_ARRAY_UNVERIFIED'
      ? result.messageList?.diagnostics.issues[0] ?? result.diagnostics.error : result.diagnostics.error;
    throw new ProbeError(code, 'Conversation response is unverified');
  }
  const list = result.messageList;
  if (list?.diagnostics.validated && list.branch) {
    return { messages: list.messages, thinkingIds: list.thinkingIds,
      branch: { ...list.branch, nodeIds: list.branch.messageIds } };
  }
  if (result.graphs.length === 1) {
    const graph = result.graphs[0]!;
    const path = verifyCurrentPath(graph, id, true, includeThinking);
    const mapping = requireRecord(graph.mapping);
    const messageIds = path.nodeIds.flatMap(nodeId => {
      const message = requireRecord(mapping[nodeId]).message;
      if (message === null) return [];
      const value = requireRecord(message).id;
      if (typeof value !== 'string' || !value) throw new ProbeError('MESSAGE_ID_MISSING', 'Message identity missing');
      return [value];
    });
    if (new Set(messageIds).size !== messageIds.length) throw new ProbeError('DUPLICATE_MESSAGE_ID', 'Duplicate branch message identity');
    return { messages: path.messages, thinkingIds: path.thinkingIds,
      branch: { currentNode: path.leafId, nodeIds: path.nodeIds, messageIds } };
  }
  throw new ProbeError('NO_VALIDATED_CONVERSATION_SOURCE', 'Conversation source is unavailable');
}
