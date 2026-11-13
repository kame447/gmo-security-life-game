/** Local-only display definitions. All navigation targets are game-internal IDs. */
export interface PhoneLink { label: string; screenId: string; summary?: string; meta?: string }
export interface PhoneScreen {
  id: string;
  title: string;
  subtitle: string;
  layout: 'list' | 'message' | 'web' | 'page' | 'placeholder';
  paragraphs: readonly string[];
  links: readonly PhoneLink[];
}
export interface PhoneApp {
  id: string;
  label: string;
  icon: 'message' | 'web' | 'life' | 'friends';
  tone: 'mint' | 'blue' | 'peach' | 'lilac';
  caption: string;
  startScreenId: string;
  screens: readonly PhoneScreen[];
}
export interface PhoneNotification { id: string; title: string; text: string; appId: string; screenId: string }
export interface PhoneContent { apps: readonly PhoneApp[]; notifications: readonly PhoneNotification[] }

/** Provisional examples for exercising the interface, not story or event decisions. */
export const PHONE_CONTENT: PhoneContent = {
  apps: [
    { id: 'messages', label: 'メッセージ', icon: 'message', tone: 'mint', caption: 'おたより', startScreenId: 'inbox', screens: [
      { id: 'inbox', title: 'メッセージ', subtitle: 'おたより', layout: 'list', paragraphs: ['とどいた メッセージ'],
        links: [{ label: 'サンプルのおたより', summary: 'ここに メッセージが とどくよ', meta: 'サンプル', screenId: 'example' }] },
      { id: 'example', title: 'サンプルのおたより', subtitle: 'メッセージ', layout: 'message',
        paragraphs: ['こんにちは！', 'これは スマホの がめんを ためすための メッセージです。'], links: [] },
    ] },
    { id: 'web', label: 'ウェブ', icon: 'web', tone: 'blue', caption: 'みてみる', startScreenId: 'home', screens: [
      { id: 'home', title: 'ウェブ', subtitle: 'ゲームのなかのページ', layout: 'web',
        paragraphs: ['ちいさな はっけんを さがしにいこう。'],
        links: [{ label: 'サンプルページ', summary: 'どんな ページか みてみよう', meta: 'ゲーム内のページ', screenId: 'example' }] },
      { id: 'example', title: 'サンプルページ', subtitle: 'ウェブ', layout: 'page',
        paragraphs: ['ようこそ！', 'ここは ゲームのなかの サンプルページです。'], links: [] },
    ] },
    { id: 'life', label: 'くらし', icon: 'life', tone: 'peach', caption: 'じゅんび中', startScreenId: 'soon', screens: [
      { id: 'soon', title: 'くらし', subtitle: 'これからのアプリ', layout: 'placeholder',
        paragraphs: ['くらしに 役立つ アプリの いりぐちです。', 'なにが できるかは これから 考えます。'], links: [] },
    ] },
    { id: 'friends', label: 'つながり', icon: 'friends', tone: 'lilac', caption: 'じゅんび中', startScreenId: 'soon', screens: [
      { id: 'soon', title: 'つながり', subtitle: 'これからのアプリ', layout: 'placeholder',
        paragraphs: ['交流する アプリの いりぐちです。', 'くわしい 内容は まだ 未定です。'], links: [] },
    ] },
  ],
  notifications: [{ id: 'sample', title: 'メッセージが とどいたよ', text: 'サンプルのおたよりを みてみよう', appId: 'messages', screenId: 'example' }],
};
