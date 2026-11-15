/** View-only chat data. The phone model owns history, validation and persistence. */
export interface ChatThreadView {
  id: string;
  name: string;
  preview: string;
  time: string;
  unread: number;
}

export interface ChatMessageView {
  id: string;
  text: string;
  time: string;
  outgoing: boolean;
}

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function avatar(name: string, id: string): HTMLElement {
  const colors = ['mint', 'blue', 'peach', 'lilac'];
  const color = colors[[...id].reduce((value, character) => value + character.codePointAt(0)!, 0) % colors.length];
  const circle = make('span', `phone-chat-avatar phone-chat-avatar-${color}`, [...name.trim()][0] ?? '•');
  circle.setAttribute('aria-hidden', 'true');
  return circle;
}

/** All names, previews and times are assigned as text, including event-provided values. */
export function renderChatList(threads: readonly ChatThreadView[], open: (id: string) => void): HTMLElement {
  const view = make('section', 'phone-chat-list');
  view.append(make('h1', 'phone-chat-title', 'トーク'));
  for (const thread of threads) {
    const button = make('button', 'phone-chat-row');
    button.type = 'button'; button.dataset.chatThread = thread.id;
    const summary = make('span', 'phone-chat-summary');
    summary.append(make('strong', 'phone-chat-name', thread.name), make('span', 'phone-chat-preview', thread.preview));
    const meta = make('span', 'phone-chat-meta');
    const time = make('time', 'phone-chat-time', thread.time); time.dataset.chatTime = 'true'; meta.append(time);
    if (thread.unread > 0) {
      const unread = make('span', 'phone-chat-unread', String(Math.min(thread.unread, 99)));
      unread.dataset.chatUnread = 'true'; unread.setAttribute('aria-label', `未読 ${thread.unread} 件`); meta.append(unread);
    }
    button.append(avatar(thread.name, thread.id), summary, meta);
    button.addEventListener('click', () => open(thread.id));
    view.append(button);
  }
  return view;
}

export interface ChatComposerOptions {
  draft: string;
  maxLength: number;
  canSend: () => boolean;
  onDraft: (value: string) => void;
  onSend: (value: string) => void;
}

/** Update only the transcript, leaving the composer and any active IME intact. */
export function renderChatMessages(scroll: HTMLElement, messages: readonly ChatMessageView[]): void {
  const items = document.createDocumentFragment();
  for (const message of messages) {
    const item = make('div', `phone-chat-message ${message.outgoing ? 'is-outgoing' : 'is-incoming'}`);
    item.dataset.chatMessage = message.id; item.dataset.direction = message.outgoing ? 'outgoing' : 'incoming';
    const bubble = make('span', 'phone-chat-bubble', message.text);
    const time = make('time', 'phone-chat-message-time', message.time);
    item.append(bubble, time); items.append(item);
  }
  scroll.replaceChildren(items);
}

/** Rendering creates nodes only; no supplied chat text is interpreted as markup. */
export function renderChatConversation(thread: ChatThreadView, messages: readonly ChatMessageView[], options: ChatComposerOptions):
  { view: HTMLElement; input: HTMLInputElement; scroll: HTMLElement; send: HTMLButtonElement } {
  const view = make('section', 'phone-chat-conversation'); view.dataset.chatConversation = thread.id;
  const header = make('header', 'phone-chat-header');
  header.append(avatar(thread.name, thread.id), make('h1', 'phone-chat-conversation-name', thread.name));
  const scroll = make('div', 'phone-chat-messages'); scroll.setAttribute('aria-label', '会話'); scroll.setAttribute('aria-live', 'polite');
  renderChatMessages(scroll, messages);
  const form = make('form', 'phone-chat-composer');
  const input = make('input', 'phone-chat-input'); input.type = 'text'; input.autocomplete = 'off';
  input.setAttribute('aria-label', 'メッセージ'); input.placeholder = 'メッセージ'; input.maxLength = options.maxLength * 2;
  input.value = options.draft;
  const send = make('button', 'phone-chat-send', '送信'); send.type = 'submit';
  const update = () => { send.disabled = !options.canSend() || !input.value.trim(); };
  input.addEventListener('input', event => {
    if (!(event instanceof InputEvent) || !event.isComposing) {
      const clean = [...input.value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '')]
        .filter(character => !/^[\ud800-\udfff]$/.test(character)).slice(0, options.maxLength).join('');
      if (clean !== input.value) {
        const start = input.selectionStart, end = input.selectionEnd;
        input.value = clean;
        if (start !== null && end !== null) input.setSelectionRange(Math.min(start, clean.length), Math.min(end, clean.length));
      }
    }
    options.onDraft(input.value); update();
  });
  form.addEventListener('submit', event => { event.preventDefault(); if (!send.disabled) options.onSend(input.value); });
  update(); form.append(input, send); view.append(header, scroll, form);
  return { view, input, scroll, send };
}
