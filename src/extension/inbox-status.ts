import { useChinese } from './inbox-language';
import type { Feedback } from './inbox-types';
import { feedbackText } from './inbox-text';
import { diagnosticText } from './inbox-diagnostics';
const tabId = Number(new URL(location.href).searchParams.get('tab'));
const hasTab = new URL(location.href).searchParams.has('tab') && Number.isInteger(tabId);
const key = hasTab ? `status:${tabId}` : 'lastStatus';
async function display() {
  const stored = await chrome.storage.local.get([key, 'preferences']);
  const lang = (stored.preferences as { language?: string } | undefined)?.language;
  const zh = useChinese(lang);
  const data = stored[key] as Feedback | undefined;
  const showDiagnostics = data?.stage === 'error' || (data?.stage === 'success' && !!data.diagnostics);
  const copy = document.getElementById('copy') as HTMLButtonElement; copy.hidden = !showDiagnostics;
  copy.textContent = zh ? '复制诊断' : 'Copy diagnostics';
  const details = document.getElementById('diagnostics')!; details.hidden = !showDiagnostics;
  document.getElementById('diagnostics-label')!.textContent = zh ? '诊断详情（无正文和令牌）' : 'Diagnostics (no text or credentials)';
  document.getElementById('diagnostics-text')!.textContent = showDiagnostics && data ? diagnosticText(data, chrome.runtime.getManifest().version) : '';
  copy.onclick = () => { if (data) void navigator.clipboard.writeText(diagnosticText(data, chrome.runtime.getManifest().version))
    .then(() => { copy.textContent = zh ? '已复制' : 'Copied'; }).catch(() => { copy.textContent = zh ? '请展开诊断详情手动复制' : 'Copy the details below manually'; }); };
  document.getElementById('heading')!.textContent = zh ? '最近保存状态' : 'Last save status';
  document.getElementById('settings')!.textContent = data?.code === 'DEFAULT_VAULT_UNAVAILABLE'
    ? (zh ? '切换仓库' : 'Switch vault') : (zh ? '设置' : 'Settings');
  document.getElementById('result')!.textContent = data ? feedbackText(data, zh) : zh ? '尚无保存记录' : 'No saves yet';
  document.getElementById('code')!.textContent = data?.code ?? '';
  const retry = document.getElementById('retry') as HTMLButtonElement; retry.textContent = zh ? '重试' : 'Retry'; retry.hidden = !hasTab || data?.stage !== 'error';
  retry.onclick = () => { void chrome.runtime.sendMessage({ type: 'retry', tabId }); };
  const open = document.getElementById('open') as HTMLAnchorElement; open.hidden = data?.stage !== 'success';
  if (data?.receipt && data.vaultName) { open.textContent = zh ? '在 Obsidian 中打开' : 'Open in Obsidian';
    open.href = `obsidian://open?vault=${encodeURIComponent(data.vaultName)}&file=${encodeURIComponent(data.receipt.path)}`; }
}
void display(); chrome.storage.onChanged.addListener(changes => { if (changes[key] || changes.preferences) void display(); });
