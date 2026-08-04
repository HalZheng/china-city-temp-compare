/**
 * 错误/提示横幅模块。
 * - show(text, type): 显示纯文本横幅（error/info 两种样式）
 * - showWithRetry(text, onRetry): 显示文本 + 内嵌"重试失败年份"按钮
 * - hide(): 隐藏横幅
 *
 * 重试按钮样式由 style.css 的 .message-retry-btn 提供。
 */
export type MessageType = 'error' | 'info';

export interface MessageBannerInstance {
  element: HTMLDivElement;
  show: (text: string, type?: MessageType) => void;
  showWithRetry: (text: string, onRetry: () => void) => void;
  hide: () => void;
}

export function createMessageBanner(): MessageBannerInstance {
  const messageEl = document.createElement('div');
  messageEl.className = 'message-banner';
  messageEl.style.display = 'none';

  function show(text: string, type: MessageType = 'error'): void {
    messageEl.textContent = text;
    messageEl.className = `message-banner message-${type}`;
    messageEl.style.display = 'block';
  }

  function showWithRetry(text: string, onRetry: () => void): void {
    messageEl.className = 'message-banner message-error';
    messageEl.innerHTML = '';
    const textSpan = document.createElement('span');
    textSpan.textContent = text;
    messageEl.appendChild(textSpan);
    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.className = 'message-retry-btn';
    retryBtn.textContent = '重试失败年份';
    retryBtn.addEventListener('click', () => {
      onRetry();
    });
    messageEl.appendChild(retryBtn);
    messageEl.style.display = 'block';
  }

  function hide(): void {
    messageEl.style.display = 'none';
  }

  return { element: messageEl, show, showWithRetry, hide };
}
