import type { MailLink } from '../phone/mail/types';

/** View-only mail data. The phone model owns the inbox, read state and persistence. */
export interface MailView {
  id: string;
  from: string;
  fromAddress: string;
  to: string;
  subject: string;
  body: string;
  links: readonly MailLink[];
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

/** Inbox in the order a mail app reads: sender and time, subject, then a one-line preview. */
export function renderMailList(mails: readonly MailView[], open: (id: string) => void): HTMLElement {
  const view = make('section', 'phone-mail-list');
  view.append(make('h1', 'phone-mail-title', '受信トレイ'));
  if (!mails.length) view.append(make('p', 'phone-mail-empty', 'メールはありません'));
  const rows = make('div', 'phone-mail-rows');
  for (const mail of mails) {
    const button = make('button', `phone-mail-row${mail.unread ? ' is-unread' : ''}`);
    button.type = 'button'; button.dataset.mail = mail.id;
    button.setAttribute('aria-label', `${mail.unread ? '未読 ' : ''}${mail.from}　${subjectText(mail)}　${mail.time}`);
    const dot = make('span', 'phone-mail-dot'); dot.setAttribute('aria-hidden', 'true');
    const summary = make('span', 'phone-mail-summary');
    const head = make('span', 'phone-mail-head');
    head.append(make('strong', 'phone-mail-from', mail.from), make('time', 'phone-mail-time', mail.time));
    summary.append(head, make('span', 'phone-mail-subject', subjectText(mail)),
      make('span', 'phone-mail-preview', mail.body.replace(/\n/g, ' ')));
    button.append(dot, summary);
    button.addEventListener('click', () => open(mail.id));
    rows.append(button);
  }
  const unread = mails.filter(mail => mail.unread).length;
  view.append(rows, make('p', 'phone-mail-count', `${mails.length}件のメール${unread ? `・未読${unread}件` : ''}`));
  return view;
}

/** Show the real address first; the optional action opens it inside the game. */
function renderLink(link: MailLink, open?: (href: string) => void): HTMLElement {
  const item = make('div', 'phone-mail-link-item');
  const button = make('button', 'phone-mail-link', link.label); button.type = 'button';
  const target = make('p', 'phone-mail-link-href');
  target.append(make('span', 'phone-mail-link-href-label', '実際のリンク先'), make('span', 'phone-mail-link-href-url', link.href));
  if (open) {
    const navigate = make('button', 'phone-mail-open-web', 'Webで開く');
    navigate.type = 'button';
    navigate.addEventListener('click', () => open(link.href));
    target.append(navigate);
  }
  target.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    target.hidden = !target.hidden;
    button.setAttribute('aria-expanded', String(!target.hidden));
  });
  item.append(button, target);
  return item;
}

export function renderMailDetail(mail: MailView, open?: (href: string) => void): HTMLElement {
  const view = make('article', 'phone-mail-detail'); view.dataset.mailDetail = mail.id;
  const header = make('header', 'phone-mail-detail-header');
  header.append(make('h1', 'phone-mail-detail-subject', subjectText(mail)));
  const sender = make('div', 'phone-mail-sender');
  const avatar = make('span', 'phone-mail-avatar', [...mail.from][0] ?? ''); avatar.setAttribute('aria-hidden', 'true');
  const info = make('div', 'phone-mail-sender-info');
  const top = make('p', 'phone-mail-detail-meta');
  top.append(make('strong', 'phone-mail-detail-from', mail.from), make('time', 'phone-mail-time', mail.time));
  info.append(top);
  if (mail.fromAddress) info.append(make('p', 'phone-mail-detail-address', mail.fromAddress));
  info.append(make('p', 'phone-mail-detail-to', `宛先：${mail.to || '自分'}`));
  sender.append(avatar, info);
  header.append(sender);
  const body = make('div', 'phone-mail-body');
  for (const paragraph of mail.body.split('\n')) body.append(make('p', '', paragraph));
  for (const link of mail.links) body.append(renderLink(link, open));
  view.append(header, body);
  return view;
}
