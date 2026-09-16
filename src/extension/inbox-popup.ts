import { conversationLocation } from '../shared/providers';
async function open() {
  const [tabs, stored] = await Promise.all([chrome.tabs.query({ active: true, currentWindow: true }), chrome.storage.local.get('preferences')]);
  const language = (stored.preferences as { language?: string } | undefined)?.language;
  const zh = language === 'zh' || (language !== 'en' && chrome.i18n.getUILanguage().startsWith('zh'));
  document.documentElement.lang = zh ? 'zh-CN' : 'en';
  const text = document.querySelector('#message')!;
  const settings = document.querySelector<HTMLButtonElement>('#settings')!;
  settings.textContent = zh ? '切换仓库 / 设置' : 'Switch vault / Settings';
  settings.addEventListener('click', () => { void chrome.runtime.openOptionsPage(); window.close(); });
  if (!conversationLocation(tabs[0]?.url)) {
    text.textContent = zh ? '请在 ChatGPT、Gemini 或 Claude 的普通聊天页面点击保存。' : 'Open a ChatGPT, Gemini, or Claude conversation, then click AI Inbox to save.';
    return;
  }
  text.textContent = zh ? '正在保存当前聊天…' : 'Saving this conversation…';
  const result: { accepted?: boolean } | undefined = await chrome.runtime.sendMessage({ type: 'save-active' });
  if (result?.accepted) window.close();
  else text.textContent = zh ? '页面已变化，请再次点击保存。' : 'The page changed. Click AI Inbox again.';
}
void open().catch(() => { document.querySelector('#message')!.textContent = 'AI Inbox could not start. Reload the extension and try again.'; });
