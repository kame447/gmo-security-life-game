import type { ObjectDef } from '../../core/types';
import { T } from '../tiles';

export interface ShopFurnishing extends Pick<ObjectDef, 'kind' | 'x' | 'y' | 'w' | 'h'> {
  readonly id: string;
  readonly solid?: boolean;
  readonly name?: string;
  readonly line?: string;
}

export interface ShopInteriorDefinition {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly floor: number;
  readonly doorX: number;
  readonly outdoorDoor: { readonly x: number; readonly y: number };
  readonly clerk: { readonly name: string; readonly sprite: string; readonly x: number; readonly y: number; readonly line: string };
  readonly furnishings: readonly ShopFurnishing[];
}

/**
 * #33の名前付き6店。広さ・家具・店員名・台詞は利用者レビュー前の暫定データ。
 * 既存の家具/NPC描画のみ使用。商品カタログ・価格・開閉条件は定義しない。
 * 施設未紐付けのcafe外観と、既存コンビニはこの追加データに含めない。
 */
export const SHOP_INTERIORS: readonly ShopInteriorDefinition[] = [
  {
    id: 'greengrocer', name: 'やおや', width: 16, height: 12, floor: T.FLOOR_CLASS, doorX: 7,
    outdoorDoor: { x: 33, y: 52 },
    clerk: { name: 'やおやさん', sprite: 'shopkeeper', x: 11, y: 3, line: 'いらっしゃい。やさいを ゆっくり みていってね。' },
    furnishings: [
      { id: 'cooler', kind: 'cooler', x: 1, y: 1, w: 4, h: 1 },
      { id: 'vegetables', kind: 'shopshelf', x: 2, y: 4, w: 3, h: 1, name: 'やさいのたな', line: 'いろいろな やさいが ならんでいる。' },
      { id: 'fruit', kind: 'shopshelf', x: 2, y: 7, w: 3, h: 1, name: 'くだもののたな', line: 'くだものが きれいに ならんでいる。' },
      { id: 'counter', kind: 'counter', x: 10, y: 2, w: 3, h: 1 },
      { id: 'plant', kind: 'plant', x: 13, y: 9, w: 1, h: 1 },
    ],
  },
  {
    id: 'bookstore', name: 'ほんや', width: 18, height: 12, floor: T.FLOOR_WOOD, doorX: 8,
    outdoorDoor: { x: 40, y: 52 },
    clerk: { name: 'ほんやさん', sprite: 'clerk', x: 13, y: 3, line: 'いらっしゃいませ。どんな ほんを さがしているの？' },
    furnishings: [
      { id: 'back-books', kind: 'bookshelf', x: 1, y: 1, w: 7, h: 1 },
      { id: 'stories', kind: 'bookshelf', x: 2, y: 4, w: 3, h: 1, name: 'ものがたりのたな', line: 'ものがたりの ほんが ならんでいる。' },
      { id: 'picture-books', kind: 'bookshelf', x: 7, y: 4, w: 3, h: 1, name: 'えほんのたな', line: 'いろとりどりの えほんが ならんでいる。' },
      { id: 'magazines', kind: 'magazine', x: 2, y: 8, w: 3, h: 1, name: 'ざっしのたな', line: 'あたらしい ざっしが ならんでいる。' },
      { id: 'counter', kind: 'counter', x: 12, y: 2, w: 3, h: 1 },
      { id: 'plant', kind: 'plant', x: 15, y: 9, w: 1, h: 1 },
    ],
  },
  {
    id: 'candy', name: 'だがしや', width: 14, height: 10, floor: T.FLOOR_WOOD, doorX: 6,
    outdoorDoor: { x: 47, y: 52 },
    clerk: { name: 'おっちゃん', sprite: 'shopkeeper', x: 10, y: 3, line: 'いらっしゃい。きょうも よく きたね。' },
    furnishings: [
      { id: 'sweets', kind: 'shopshelf', x: 2, y: 3, w: 2, h: 1, name: 'あまいおかしのたな', line: 'ちいさな おかしが ならんでいる。' },
      { id: 'snacks', kind: 'shopshelf', x: 2, y: 5, w: 2, h: 1, name: 'おやつのたな', line: 'いろいろな おやつが ならんでいる。' },
      { id: 'counter', kind: 'counter', x: 9, y: 2, w: 3, h: 1 },
      { id: 'bench', kind: 'bench', x: 1, y: 7, w: 3, h: 1 },
      { id: 'window', kind: 'window', x: 2, y: 0, w: 2, h: 1, solid: false },
    ],
  },
  {
    id: 'bakery', name: 'パンや', width: 16, height: 12, floor: T.FLOOR_WOOD, doorX: 7,
    outdoorDoor: { x: 61, y: 52 },
    clerk: { name: 'パンやさん', sprite: 'clerk', x: 11, y: 3, line: 'いらっしゃいませ。パンを みていってね。' },
    furnishings: [
      { id: 'kitchen', kind: 'kitchen', x: 1, y: 1, w: 4, h: 1 },
      { id: 'bread', kind: 'shopshelf', x: 2, y: 4, w: 3, h: 1, name: 'パンのたな', line: 'かたちの ちがう パンが ならんでいる。' },
      { id: 'small-bread', kind: 'shopshelf', x: 2, y: 7, w: 3, h: 1, name: 'ちいさなパンのたな', line: 'ちいさな パンが ならんでいる。' },
      { id: 'counter', kind: 'counter', x: 10, y: 2, w: 3, h: 1 },
      { id: 'plant', kind: 'plant', x: 13, y: 9, w: 1, h: 1 },
    ],
  },
  {
    id: 'cafe', name: 'きっさてん', width: 18, height: 14, floor: T.FLOOR_WOOD, doorX: 8,
    outdoorDoor: { x: 68, y: 52 },
    clerk: { name: 'てんいんさん', sprite: 'clerk', x: 13, y: 3, line: 'いらっしゃいませ。どうぞ ゆっくり していってね。' },
    furnishings: [
      { id: 'kitchen', kind: 'kitchen', x: 1, y: 1, w: 5, h: 1 },
      { id: 'counter', kind: 'counter', x: 12, y: 2, w: 3, h: 1 },
      { id: 'table-north-west', kind: 'table', x: 2, y: 5, w: 2, h: 2, name: 'まどぎわのテーブル', line: 'ゆっくり すごせそうな テーブルだ。' },
      { id: 'table-north-east', kind: 'table', x: 7, y: 5, w: 2, h: 2 },
      { id: 'table-south-west', kind: 'table', x: 2, y: 9, w: 2, h: 2 },
      { id: 'table-south-east', kind: 'table', x: 7, y: 9, w: 2, h: 2 },
      { id: 'sofa', kind: 'sofa', x: 12, y: 9, w: 3, h: 1 },
      { id: 'plant', kind: 'plant', x: 15, y: 11, w: 1, h: 1 },
    ],
  },
  {
    id: 'pharmacy', name: 'くすりや', width: 16, height: 12, floor: T.FLOOR_CLASS, doorX: 7,
    outdoorDoor: { x: 75, y: 52 },
    clerk: { name: 'くすりやさん', sprite: 'clerk', x: 11, y: 3, line: 'いらっしゃいませ。なにか おさがしですか？' },
    furnishings: [
      { id: 'back-shelf', kind: 'shopshelf', x: 1, y: 1, w: 5, h: 1 },
      { id: 'daily-goods', kind: 'shopshelf', x: 2, y: 4, w: 3, h: 1, name: 'にちようひんのたな', line: 'せっけんや ティッシュが ならんでいる。' },
      { id: 'medicine', kind: 'shopshelf', x: 2, y: 7, w: 3, h: 1, name: 'くすりのたな', line: 'くすりの はこが ならんでいる。' },
      { id: 'counter', kind: 'counter', x: 10, y: 2, w: 3, h: 1 },
      { id: 'plant', kind: 'plant', x: 13, y: 9, w: 1, h: 1 },
    ],
  },
];
