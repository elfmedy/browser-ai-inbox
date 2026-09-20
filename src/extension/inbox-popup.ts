import { conversationLocation } from '../shared/providers';
import { useChinese } from './inbox-language';
let zh = useChinese();
async function open() {
  const [tabs, stored] = await Promise.all([chrome.tabs.query({ active: true, currentWindow: true }), chrome.storage.local.get('preferences')]);
  const language = (stored.preferences as { language?: string } | undefined)?.language;
  zh = useChinese(language);
  document.documentElement.lang = zh ? 'zh-CN' : 'en';
  const text = document.querySelector('#message')!;
  const settings = document.querySelector<HTMLButtonElement>('#settings')!;
  settings.textContent = zh ? '切换仓库 / 设置' : 'Switch vault / Settings';
  settings.addEventListener('click', () => { void chrome.runtime.openOptionsPage(); window.close(); });
  if (!conversationLocation(tabs[0]?.url)) {
    const url = new URL(tabs[0]?.url ?? 'about:blank');
    const site = url.origin === 'https://chatgpt.com' ? 'ChatGPT' : url.origin === 'https://gemini.google.com' ? 'Gemini' : url.origin === 'https://claude.ai' ? 'Claude' : null;
    const home = site && (url.pathname === '/' || (site === 'Gemini' && /^\/(?:u\/\d+\/)?app\/?$/.test(url.pathname)) || (site === 'Claude' && url.pathname === '/new'));
    text.textContent = home ? (zh ? `当前是 ${site} 的新对话页面，还没有可保存的对话。请先选择一段已有对话，或发送第一条消息、等待回复完成后再保存。`
      : `This is the ${site} new-chat page. There is no conversation to save yet. Select an existing conversation, or send your first message and wait for the reply before saving.`)
      : zh ? '请打开 ChatGPT、Gemini 或 Claude 中的一段普通聊天后再保存。' : 'Open an individual ChatGPT, Gemini, or Claude conversation to save it.';
    return;
  }
  text.textContent = zh ? '正在保存当前聊天…' : 'Saving this conversation…';
  const result: { accepted?: boolean } | undefined = await chrome.runtime.sendMessage({ type: 'save-active' });
  if (result?.accepted) window.close();
  else text.textContent = zh ? '页面已变化，请再次点击保存。' : 'The page changed. Click AI Inbox again.';
}
void open().catch(() => { document.querySelector('#message')!.textContent = zh ? 'AI Inbox 未能启动，请重新加载扩展后重试。' : 'AI Inbox could not start. Reload the extension and try again.'; });
