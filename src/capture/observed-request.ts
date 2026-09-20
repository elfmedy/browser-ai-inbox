import { readBounded } from '../assets/inspect';
import { extractJsonDocuments, findConversationGraphs } from './hydration';
import { isRecord, ProbeError } from '../shared/errors';
import { summarizeResponseShape } from './response-shape';
import { inspectMessageList, messageListCoverage } from './message-list';
import { collectPaginatedMessages } from './paginated-messages';
import { downloadChatImage } from '../assets/chatgpt-image';

interface Resource { name: string; initiatorType: string; }
export interface RequestDiagnostics {
  selection: { source: 'observed' | 'known-route'; route: 'plural' | 'legacy' | 'legacy-f';
    attempts: { route: 'plural' | 'legacy' | 'legacy-f'; status: number }[] };
  discovery: { resourceEntries: number; fetchEntries: number; currentChatRouteEntries: number;
    recognizedRequests: number; rejectedQueryEntries: number; otherConversationEntries: number;
    unknownConversationRouteEntries: number; sessionRequestObserved: boolean };
  resourceEntries: number; conversationRequests: number; sessionRequestObserved: boolean;
  attempted: boolean; httpStatus: number | null; sessionHttpStatus: number | null;
  authSource: 'none' | 'page-session' | 'observed-session' | 'known-session'; graphCandidates: number;
  error: string | null;
  requestedTurnLimit: number | null;
  responseShape: ReturnType<typeof summarizeResponseShape> | null;
  messageArray: ReturnType<typeof inspectMessageList>['diagnostics'] | null;
  pagination: { additionalRequests: number; pages: number; completed: boolean; headRechecked: boolean } | null;
}

/** Only recognize bounded, same-origin routes for the current chat.
 * Missing timing entries are handled separately by the pinned route contract. */
export function discoverRequests(resources: Resource[], pageUrl: string) {
  const page = new URL(pageUrl);
  const id = /^\/c\/([a-zA-Z0-9-]+)\/?$/.exec(page.pathname)?.[1];
  if (page.origin !== 'https://chatgpt.com' || page.username || page.password || !id || id.length > 128) throw new ProbeError('UNSUPPORTED_PAGE', 'Expected ordinary chat');
  const conversations = new Set<string>();
  const sessions = new Set<string>();
  const discovery = { resourceEntries: resources.length, fetchEntries: 0, currentChatRouteEntries: 0,
    recognizedRequests: 0, rejectedQueryEntries: 0, otherConversationEntries: 0,
    unknownConversationRouteEntries: 0, sessionRequestObserved: false };
  for (const resource of resources) {
    if (!['fetch', 'xmlhttprequest'].includes(resource.initiatorType)) continue;
    discovery.fetchEntries++;
    let url: URL;
    try { url = new URL(resource.name); } catch { continue; }
    if (url.origin !== page.origin || url.username || url.password || url.hash) continue;
    const route = /^\/backend-api\/(?:f\/)?conversations?\/([^/]+)$/.exec(url.pathname);
    if (route) {
      if (route[1] === id) discovery.currentChatRouteEntries++;
      else discovery.otherConversationEntries++;
    } else if (/^\/backend-api\/(?:f\/)?conversations?(?:\/|$)/.test(url.pathname)) discovery.unknownConversationRouteEntries++;
    // Observed in the user's Network capture: plural route with these two
    // parameters. Replay the observed URL unchanged; do not raise/remove limits.
    if (url.pathname === `/backend-api/conversations/${id}`) {
      const keys = [...url.searchParams.keys()];
      const known = keys.every(key => ['include_has_versions', 'num_turns'].includes(key));
      const unique = keys.length === new Set(keys).size;
      const versions = url.searchParams.get('include_has_versions');
      const turns = url.searchParams.get('num_turns');
      if (known && unique && (versions === null || ['true', 'false'].includes(versions)) &&
          (turns === null || /^[1-9]\d{0,4}$/.test(turns))) conversations.add(url.href);
      else discovery.rejectedQueryEntries++;
    } else if (!url.search) {
      if (url.pathname === `/backend-api/conversation/${id}` || url.pathname === `/backend-api/f/conversation/${id}`) conversations.add(url.href);
      if (url.pathname === '/api/auth/session') sessions.add(url.href);
    } else if (url.pathname === `/backend-api/conversation/${id}` || url.pathname === `/backend-api/f/conversation/${id}`) discovery.rejectedQueryEntries++;
  }
  discovery.recognizedRequests = conversations.size;
  discovery.sessionRequestObserved = sessions.size > 0;
  return { id, conversations: [...conversations], sessions: [...sessions], discovery };
}

// A session credential is used only in memory for the validated current-chat
// URL. Never include this value or source JSON in diagnostics or storage.
function sessionToken(documents: unknown[]): string | undefined {
  const seen = new Set<object>();
  const queue = [...documents];
  for (let position = 0; position < queue.length; position++) {
    if (position > 200000) return undefined;
    const value = queue[position];
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (isRecord(value) && isRecord(value.user) && typeof value.expires === 'string' &&
        typeof value.accessToken === 'string' && value.accessToken.length > 0 &&
        value.accessToken.length < 16384 && !/[\r\n]/.test(value.accessToken)) return value.accessToken;
    const children: unknown[] = Object.values(value);
    for (const child of children) queue.push(child);
  }
  return undefined;
}

async function requestJson(url: string, fetcher: typeof fetch, token?: string) {
  const response = await fetcher(url, { method: 'GET', credentials: 'same-origin', redirect: 'error', cache: 'no-store',
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(15000) });
  if (response.url !== url || response.redirected) throw new ProbeError('API_IDENTITY_CHANGED', 'Unexpected response URL');
  if (!response.ok) { await response.body?.cancel(); return { status: response.status, data: null }; }
  if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) {
    await response.body?.cancel();
    throw new ProbeError('API_TYPE_INVALID', 'Expected JSON response');
  }
  const bytes = await readBounded(response, 20 * 1024 * 1024);
  const data: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return { status: response.status, data };
}

export async function probeObservedRequest(input: { pageUrl: string; resources: Resource[]; scripts: string[]; enableToolImages?: boolean; includeThinking?: boolean }, fetcher: typeof fetch = fetch) {
  const requests = discoverRequests(input.resources, input.pageUrl);
  const route = (url: string): RequestDiagnostics['selection']['route'] => new URL(url).pathname.includes('/conversations/') ? 'plural'
    : new URL(url).pathname.includes('/f/conversation/') ? 'legacy-f' : 'legacy';
  const rank = (url: string) => ({ plural: 0, legacy: 1, 'legacy-f': 2 })[route(url)];
  const observed = [...requests.conversations].sort((a, b) => rank(a) - rank(b)
    || Number(new URL(b).searchParams.get('include_has_versions') === 'true') - Number(new URL(a).searchParams.get('include_has_versions') === 'true')
    || Number(new URL(b).searchParams.get('num_turns')) - Number(new URL(a).searchParams.get('num_turns'))
    || (a < b ? -1 : a > b ? 1 : 0));
  // Pinned upstream: ThierryAbalea/chatgpt-conversation-export,
  // 543a98a3f6cfb0f59ad23cd1c0b6d070f4e98324, extension/popup.js.
  // Try only known current-chat routes; a 404 may select the alternate route.
  const plural = `https://chatgpt.com/backend-api/conversations/${requests.id}?include_has_versions=true&num_turns=100`;
  const legacy = `https://chatgpt.com/backend-api/conversation/${requests.id}`;
  const candidates = [...new Set([observed[0] ?? plural, plural, legacy])];
  let selected = candidates[0]!;
  const diagnostics: RequestDiagnostics = {
    selection: { source: observed.length ? 'observed' : 'known-route', route: route(selected), attempts: [] },
    discovery: requests.discovery,
    resourceEntries: input.resources.length, conversationRequests: requests.conversations.length,
    sessionRequestObserved: requests.sessions.length > 0, attempted: false, httpStatus: null,
    sessionHttpStatus: null, authSource: 'none', graphCandidates: 0, error: null,
    requestedTurnLimit: null, responseShape: null, messageArray: null, pagination: null,
  };
  let graphs: Record<string, unknown>[] = [];
  let messageList: ReturnType<typeof inspectMessageList> | null = null;
  let sourceTitle = '';
  let downloadImage: ((reference: string) => ReturnType<typeof downloadChatImage>) | undefined;
  try {
    const documents = extractJsonDocuments(input.scripts);
    let token = sessionToken(documents);
    if (token) diagnostics.authSource = 'page-session';
    diagnostics.attempted = true;
    let sessionRefreshed = false;
    const readConversation = async (url: string) => {
      const result = await requestJson(url, fetcher, token);
      diagnostics.httpStatus = result.status;
      diagnostics.selection.attempts.push({ route: route(url), status: result.status });
      return result;
    };
    let response: Awaited<ReturnType<typeof requestJson>> = { status: 404, data: null };
    for (const candidate of candidates) {
      selected = candidate;
      diagnostics.selection.route = route(selected);
      diagnostics.selection.source = requests.conversations.includes(selected) ? 'observed' : 'known-route';
      const limit = new URL(selected).searchParams.get('num_turns');
      diagnostics.requestedTurnLimit = limit === null ? null : Number(limit);
      response = await readConversation(selected);
      if (response.status === 401 && !sessionRefreshed) {
        sessionRefreshed = true;
        const session = await requestJson('https://chatgpt.com/api/auth/session', fetcher);
        diagnostics.sessionHttpStatus = session.status;
        token = sessionToken([session.data]);
        if (token) {
          diagnostics.authSource = requests.sessions.length ? 'observed-session' : 'known-session';
          response = await readConversation(selected);
        }
      }
      if (response.status !== 404) break;
    }
    if (response.status !== 200) diagnostics.error = 'CURRENT_CHAT_API_FAILED';
    else {
      sourceTitle = isRecord(response.data) && typeof response.data.title === 'string' ? response.data.title : '';
      downloadImage = reference => downloadChatImage(reference, token, fetcher);
      diagnostics.responseShape = summarizeResponseShape(response.data);
      if (isRecord(response.data) && isRecord(response.data.page_info) && response.data.page_info.has_previous_page === true &&
          new URL(selected).pathname === `/backend-api/conversations/${requests.id}`) {
        const pagination = { additionalRequests: 0, pages: 1, completed: false, headRechecked: false };
        diagnostics.pagination = pagination;
        const collected = await collectPaginatedMessages(response.data, requests.id, async before => {
          // Only derive a preceding page of the selected current-chat route.
          // The before contract is documented by the pinned upstream exporter.
          const url = new URL(selected);
          if (before !== null) url.searchParams.set('before', before);
          pagination.additionalRequests++;
          const next = await requestJson(url.href, fetcher, token);
          if (next.status !== 200) throw new ProbeError('PAGINATION_REQUEST_FAILED', 'An additional page request failed');
          return next.data;
        });
        pagination.pages = collected.pages;
        pagination.completed = true;
        pagination.headRechecked = collected.headRechecked;
        response = { ...response, data: collected.data };
      }
      if (isRecord(response.data) && Array.isArray(response.data.messages)) {
        messageList = inspectMessageList(response.data, requests.id, messageListCoverage(response.data), input.enableToolImages, input.includeThinking);
        diagnostics.messageArray = messageList.diagnostics;
      }
      graphs = findConversationGraphs([response.data], requests.id);
      diagnostics.graphCandidates = graphs.length;
      if (diagnostics.responseShape.explicitlyPartial && !diagnostics.pagination?.completed) {
        graphs = [];
        diagnostics.error = 'CURRENT_CHAT_RESPONSE_PARTIAL';
      } else if (graphs.length === 0 && !messageList?.diagnostics.validated) {
        diagnostics.error = messageList ? 'CURRENT_CHAT_MESSAGE_ARRAY_UNVERIFIED' : 'CURRENT_CHAT_API_NO_GRAPH';
      }
    }
  } catch (error) {
    diagnostics.error = error instanceof ProbeError ? error.code : 'CURRENT_CHAT_API_REQUEST_FAILED';
  }
  return { graphs, diagnostics, messageList, sourceTitle, downloadImage };
}
