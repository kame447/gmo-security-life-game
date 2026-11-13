/** Game-local display data. Screen links are IDs, never URLs. */
export interface PhoneLink { label: string; screenId: string }
export interface PhoneScreen {
  id: string;
  title: string;
  paragraphs: readonly string[];
  links: readonly PhoneLink[];
}
export interface PhoneApp {
  id: string;
  label: string;
  icon: string;
  startScreenId: string;
  screens: readonly PhoneScreen[];
}
export interface PhoneNotification { id: string; text: string; appId: string; screenId: string }
export interface PhoneContent { apps: readonly PhoneApp[]; notifications: readonly PhoneNotification[] }

/** Temporary examples for testing the UI, not characters or story events. */
export const PHONE_CONTENT: PhoneContent = {
  apps: [
    { id: 'messages', label: 'メッセージ', icon: '✉', startScreenId: 'inbox', screens: [
      { id: 'inbox', title: 'メッセージ', paragraphs: ['サンプルのメッセージを ひらけます。'],
        links: [{ label: 'サンプルメッセージ', screenId: 'example' }] },
      { id: 'example', title: 'サンプルメッセージ', paragraphs: ['これは がめんを ためすための メッセージです。'], links: [] },
    ] },
    { id: 'web', label: 'ウェブ', icon: '◎', startScreenId: 'home', screens: [
      { id: 'home', title: 'ウェブ', paragraphs: ['ゲームのなかの サンプルページです。'],
        links: [{ label: 'サンプルページを みる', screenId: 'example' }] },
      { id: 'example', title: 'サンプルページ', paragraphs: ['ここは ゲームのなかの ページです。'], links: [] },
    ] },
  ],
  notifications: [{ id: 'sample', text: 'サンプルメッセージが あります', appId: 'messages', screenId: 'example' }],
};
