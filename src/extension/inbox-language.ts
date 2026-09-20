/** Explicit extension settings win; auto follows the browser's preferred language. */
export function useChinese(language?: string): boolean {
  if (language && language !== 'auto') return /^zh(?:-|$)/i.test(language);
  const preferred = globalThis.navigator?.languages?.[0] || globalThis.navigator?.language || chrome.i18n.getUILanguage();
  return /^zh(?:-|$)/i.test(preferred);
}
