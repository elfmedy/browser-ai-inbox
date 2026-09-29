import type { SnapshotData, SaveRequestData } from '../core/schema';
import type { SaveReceipt } from '../core/schema';
import type { inspectMessageList } from '../capture/message-list';
import { ProbeError } from '../shared/errors';
import type { RequestDiagnostics } from '../capture/observed-request';
import type { pageChange, responseChange } from '../capture/source-change';
import type { DomWitness } from '../capture/dom-witness';

export type Stage = 'connecting' | 'pairing' | 'reading' | 'images' | 'checking' | 'transferring' | 'saving' | 'recovering' | 'success' | 'error';
export interface Connection { endpoint: string; vaultId: string; token: string; }
export interface Preferences { language: 'auto' | 'zh' | 'en'; contextMenu: boolean; }
export interface CaptureDiagnostics { adapterVersion: 2; phase: 'reading' | 'checking'; httpStatus: number | null;
  discovery?: RequestDiagnostics['discovery'];
  request?: Pick<RequestDiagnostics, 'selection' | 'authSource' | 'sessionHttpStatus' | 'requestedTurnLimit' | 'pagination'>;
  sourceChange?: (NonNullable<ReturnType<typeof pageChange>> | NonNullable<ReturnType<typeof responseChange>>) & { stage: Stage; elapsedMs: number };
  branchVerification?: { source: 'api'; apiRecheck: 'pending' | 'unchanged' | 'changed'; initial?: DomWitness; current?: DomWitness };
  page?: { readyState: string; ageMs: number; visibility: string; visibleMessages: number; navigationType: string };
  provider?: 'chatgpt' | 'gemini' | 'claude'; dom?: { messages: number; history: string };
  requestCode: string | null; validation: ReturnType<typeof inspectMessageList>['diagnostics'] | null; }
export class CaptureFailure extends ProbeError {
  constructor(code: string, public readonly diagnostics?: CaptureDiagnostics) { super(code, 'Capture failed before submission'); }
}
export class VaultUnavailableFailure extends ProbeError {
  constructor(public readonly defaultVaultName: string, public readonly availableVaultNames: string[]) {
    super('DEFAULT_VAULT_UNAVAILABLE', 'Default vault is unavailable');
  }
}
export interface Feedback { stage: Stage; code?: string; count?: number; total?: number; receipt?: SaveReceipt; vaultName?: string; pageUrl?: string;
  defaultVaultName?: string; availableVaultNames?: string[];
  notSubmitted?: boolean; diagnostics?: CaptureDiagnostics; pairCode?: string; }
export interface Job { tabId: number; pageUrl: string; vaultId: string; request: SaveRequestData; bytes: Record<string, Uint8Array>; diagnostics?: CaptureDiagnostics; }
export interface CaptureState {
  id: string; pageUrl: string; started: number; stage: Stage; count?: number; total?: number; code?: string;
  snapshot?: SnapshotData; bytes: Record<string, Uint8Array>;
  diagnostics?: CaptureDiagnostics;
}
declare global { var aiInboxCaptureOptions: { includeThinking: boolean } | undefined; var aiInboxCapture: CaptureState | undefined; }
