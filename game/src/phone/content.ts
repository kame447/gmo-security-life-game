/** Local-only display definitions. All navigation targets are game-internal IDs. */
export interface PhoneLink { label: string; screenId: string; summary?: string; meta?: string }
export interface PhoneScreen {
  id: string;
  title: string;
  subtitle: string;
  layout: 'list' | 'message' | 'web' | 'page' | 'placeholder' | 'usage';
  paragraphs: readonly string[];
  links: readonly PhoneLink[];
}
export interface PhoneApp {
  id: string;
  label: string;
  icon: 'message' | 'web' | 'life' | 'friends' | 'data';
  tone: 'mint' | 'blue' | 'peach' | 'lilac' | 'slate';
  caption: string;
  requiresNetwork?: boolean;
  startScreenId: string;
  screens: readonly PhoneScreen[];
}
export interface PhoneNotification { id: string; title: string; text: string; appId: string; screenId: string }
export interface PhoneContent { apps: readonly PhoneApp[]; notifications: readonly PhoneNotification[] }

/** Provisional examples for exercising the interface, not story or event decisions. */
export const PHONE_CONTENT: PhoneContent = {
  apps: [
    { id: 'messages', label: 'メッセージ', icon: 'message', tone: 'mint', caption: 'おたより', startScreenId: 'inbox', screens: [
      { id: 'inbox', title: 'メッセージ', subtitle: '', layout: 'list', paragraphs: [],
        links: [{ label: 'サンプル', summary: 'こんにちは', screenId: 'example' }] },
      { id: 'example', title: 'サンプルのおたより', subtitle: 'メッセージ', layout: 'message',
        paragraphs: ['こんにちは。'], links: [] },
    ] },
    { id: 'web', label: 'ウェブ', icon: 'web', tone: 'blue', caption: 'みてみる', requiresNetwork: true, startScreenId: 'home', screens: [
      { id: 'home', title: 'ウェブ', subtitle: 'ゲームのなかのページ', layout: 'web',
        paragraphs: [], links: [{ label: 'サンプルページ', screenId: 'example' }] },
      { id: 'example', title: 'サンプルページ', subtitle: 'ウェブ', layout: 'page',
        paragraphs: ['サンプルページ'], links: [] },
    ] },
    { id: 'life', label: 'くらし', icon: 'life', tone: 'peach', caption: 'じゅんび中', startScreenId: 'soon', screens: [
      { id: 'soon', title: 'くらし', subtitle: 'これからのアプリ', layout: 'placeholder',
        paragraphs: [], links: [] },
    ] },
    { id: 'friends', label: 'つながり', icon: 'friends', tone: 'lilac', caption: 'じゅんび中', startScreenId: 'soon', screens: [
      { id: 'soon', title: 'つながり', subtitle: 'これからのアプリ', layout: 'placeholder',
        paragraphs: [], links: [] },
    ] },
    { id: 'data', label: '通信', icon: 'data', tone: 'slate', caption: '', startScreenId: 'usage', screens: [
      { id: 'usage', title: '通信', subtitle: '', layout: 'usage', paragraphs: [], links: [] },
    ] },
  ],
  notifications: [{ id: 'sample', title: 'メッセージ', text: 'こんにちは', appId: 'messages', screenId: 'example' }],
};
