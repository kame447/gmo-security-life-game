/** View-only mail data. The phone model owns the inbox, read state and persistence. */
export interface MailView {
  id: string;
  from: string;
  subject: string;
  body: string;
  time: string;
  unread: boolean;
}

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const subjectText = (mail: MailView) => mail.subject || '（件名なし）';

/** All senders, subjects and bodies are assigned as text, including event-provided values. */
export function renderMailList(mails: readonly MailView[], open: (id: string) => void): HTMLElement {
  const view = make('section', 'phone-mail-list');
  view.append(make('h1', 'phone-mail-title', 'メール'));
  if (!mails.length) view.append(make('p', 'phone-mail-empty', 'メールはありません'));
  for (const mail of mails) {
    const button = make('button', `phone-mail-row${mail.unread ? ' is-unread' : ''}`);
    button.type = 'button'; button.dataset.mail = mail.id;
    button.setAttribute('aria-label', `${mail.unread ? '未読 ' : ''}${mail.from}　${subjectText(mail)}`);
    const dot = make('span', 'phone-mail-dot'); dot.setAttribute('aria-hidden', 'true');
    const summary = make('span', 'phone-mail-summary');
    const head = make('span', 'phone-mail-head');
    head.append(make('strong', 'phone-mail-from', mail.from), make('time', 'phone-mail-time', mail.time));
    summary.append(head, make('span', 'phone-mail-subject', subjectText(mail)),
      make('span', 'phone-mail-preview', mail.body.replace(/\n/g, ' ')));
    button.append(dot, summary);
    button.addEventListener('click', () => open(mail.id));
    view.append(button);
  }
  return view;
}

export function renderMailDetail(mail: MailView): HTMLElement {
  const view = make('article', 'phone-mail-detail'); view.dataset.mailDetail = mail.id;
  const header = make('header', 'phone-mail-detail-header');
  header.append(make('h1', 'phone-mail-detail-subject', subjectText(mail)));
  const meta = make('p', 'phone-mail-detail-meta');
  meta.append(make('span', 'phone-mail-detail-from', mail.from), make('time', 'phone-mail-time', mail.time));
  header.append(meta);
  const body = make('div', 'phone-mail-body');
  for (const paragraph of mail.body.split('\n')) body.append(make('p', '', paragraph));
  view.append(header, body);
  return view;
}
