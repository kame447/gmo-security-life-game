import type { MailContent } from '../phone/mail/types';

/** Review-only senders, text and arrival delays. No adopted NPC, event or security scenario. */
export const MAIL_PROTOTYPE: MailContent = {
  initialMessages: [
    { id: 'welcome', from: 'スマホのおしらせ', subject: 'メールが使えるようになりました',
      body: 'このスマホでは、メールを受け取れます。\n届いたメールは、新しい順にここへ並びます。', atMs: 0, read: false },
  ],
  scheduled: [
    { id: 'library-1', from: 'まちの図書館', subject: '今月のおはなし会',
      body: '土曜日の午前に、おはなし会をひらきます。\nだれでも参加できます。', delayMs: 30_000 },
    { id: 'street-1', from: 'えきまえ商店街', subject: '週末のおしらせ',
      body: '週末は、商店街の通りに花をかざります。\nお散歩のついでに見に来てください。', delayMs: 90_000 },
  ],
};
