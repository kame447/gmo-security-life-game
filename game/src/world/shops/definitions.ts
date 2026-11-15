import type { Facing } from '../../core/coords';
import type { ObjectDef } from '../../core/types';
import { T } from '../tiles';

export interface ShopFurnishing extends Pick<ObjectDef, 'kind' | 'x' | 'y' | 'w' | 'h'> {
  readonly id: string;
  readonly style?: string;
  readonly layer?: ObjectDef['layer'];
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
  readonly clerk: {
    readonly name: string;
    readonly sprite: string;
    readonly x: number;
    readonly y: number;
    readonly facing?: Facing;
    readonly line: string;
  };
  readonly furnishings: readonly ShopFurnishing[];
}

/**
 * #33の名前付き6店。業種ごとの商品・陳列什器・カウンター・動線を含む屋内データ。
 * 商品カタログ・価格・開閉条件はここには含めない。
 * 施設未紐付けのcafe外観と、既存コンビニはこの追加データに含めない。
 */
export const SHOP_INTERIORS: readonly ShopInteriorDefinition[] = [
  {
    id: 'greengrocer', name: 'やおや', width: 16, height: 12, floor: T.FLOOR_CLASS, doorX: 7,
    outdoorDoor: { x: 33, y: 52 },
    clerk: { name: 'やおやさん', sprite: 'shopkeeper', x: 12, y: 2, facing: 'down', line: 'いらっしゃい。きょうは キャベツも みかんも とれたてだよ！' },
    furnishings: [
      { id: 'floor', kind: 'shop-floor', style: 'doma', x: 1, y: 1, w: 14, h: 10, solid: false, layer: 'decal' },
      { id: 'entry-rug', kind: 'shop-rug', style: 'greengrocer', x: 7, y: 8, w: 2, h: 2, solid: false, layer: 'decal' },
      { id: 'cooler', kind: 'greengrocer-chill-case', x: 1, y: 1, w: 3, h: 1, name: 'れいぞうケース', line: 'みずみずしい キャベツや だいこんが ひえている。' },
      { id: 'back-roots', kind: 'greengrocer-produce-stand', style: 'roots', x: 5, y: 1, w: 4, h: 1 },
      { id: 'vegetables', kind: 'greengrocer-produce-stand', style: 'greens', x: 1, y: 4, w: 3, h: 2, name: 'やさいのきばこ', line: 'あおい キャベツに トマト、にんじんが きばこに ぎっしり！' },
      { id: 'baskets', kind: 'greengrocer-basket-rack', x: 1, y: 7, w: 3, h: 1, name: 'かごのやさい', line: 'まるい キャベツや トマト、きゅうりが かごに ならんでいる。' },
      { id: 'crates', kind: 'greengrocer-produce-stand', style: 'roots', x: 12, y: 4, w: 3, h: 2, name: 'こんさいのきばこ', line: 'ふとい だいこんと にんじんが 山もりに つまれている。' },
      { id: 'fruit', kind: 'greengrocer-fruit-table', x: 12, y: 7, w: 3, h: 2, name: 'くだもののだい', line: 'あかい りんご、あまい みかん、バナナも かごいっぱい！' },
      { id: 'counter', kind: 'greengrocer-counter', x: 10, y: 2, w: 2, h: 1 },
    ],
  },
  {
    id: 'bookstore', name: 'ほんや', width: 18, height: 12, floor: T.FLOOR_WOOD, doorX: 8,
    outdoorDoor: { x: 40, y: 52 },
    clerk: { name: 'ほんやさん', sprite: 'clerk', x: 14, y: 2, facing: 'down', line: 'いらっしゃいませ。お探しの ほんが あれば こえを かけてくださいね。' },
    furnishings: [
      { id: 'entry-rug', kind: 'shop-rug', style: 'bookstore', x: 7, y: 8, w: 4, h: 2, solid: false, layer: 'decal' },
      { id: 'back-books-west', kind: 'bookstore-tall-shelf', style: 'a', x: 1, y: 1, w: 4, h: 1 },
      { id: 'back-books-east', kind: 'bookstore-tall-shelf', style: 'b', x: 6, y: 1, w: 4, h: 1 },
      { id: 'picture-books', kind: 'bookstore-picture-shelf', x: 2, y: 4, w: 3, h: 2, name: 'えほんのたな', line: 'たのしい えの ひょうしが みえるように えほんが ならんでいる。' },
      { id: 'flat-novels', kind: 'bookstore-flat-table', style: 'novels', x: 7, y: 4, w: 3, h: 2, name: 'ひらづみのだい', line: 'おすすめPOPといっしょに わだいの ほんが ひらづみに されている。' },
      { id: 'comics-table', kind: 'bookstore-flat-table', style: 'comics', x: 12, y: 5, w: 3, h: 2, name: 'しんかんのだい', line: 'しんかんの まんがや ぶんこぼんが きれいに つまれている。' },
      { id: 'magazines', kind: 'bookstore-magazine-rack', x: 2, y: 8, w: 3, h: 1, name: 'ざっしのたな', line: 'しゅうかんしや しゅみの ざっしが みやすく ならんでいる。' },
      { id: 'counter', kind: 'bookstore-counter', x: 12, y: 2, w: 2, h: 1 },
      { id: 'counter-side', kind: 'bookstore-counter', style: 'side', x: 15, y: 2, w: 2, h: 1 },
      { id: 'plant', kind: 'plant', x: 1, y: 3, w: 1, h: 1 },
    ],
  },
  {
    id: 'candy', name: 'だがしや', width: 14, height: 10, floor: T.FLOOR_WOOD, doorX: 6,
    outdoorDoor: { x: 47, y: 52 },
    clerk: { name: 'おっちゃん', sprite: 'shopkeeper', x: 11, y: 2, facing: 'down', line: 'いらっしゃい。こぜにを にぎって ゆっくり えらんでいきな。' },
    furnishings: [
      { id: 'entry-rug', kind: 'shop-rug', style: 'candy', x: 6, y: 7, w: 2, h: 1, solid: false, layer: 'decal' },
      { id: 'jar-stand', kind: 'candy-jar-stand', x: 1, y: 1, w: 3, h: 1, name: 'あめだまのびん', line: 'とうめいな ガラスびんに カラフルな あめ玉が ぎっしり！' },
      { id: 'hanging-rack', kind: 'candy-hanging-rack', x: 5, y: 1, w: 3, h: 1, name: 'あてくじとキャンディ', line: 'つりさげおかしと あてくじ、ペロペロキャンディが ならんでいる。' },
      { id: 'sweets', kind: 'candy-box-rack', x: 1, y: 4, w: 3, h: 2, name: 'だがしのはこだな', line: '１０えんや ３０えんの おかしや ラムネが きばこに ならんでいる。' },
      { id: 'snacks', kind: 'candy-low-bins', x: 9, y: 5, w: 3, h: 2, name: 'ひくめのおやつばこ', line: '大きな ペロペロキャンディや ラムネ、スナックが てにとれる！' },
      { id: 'counter', kind: 'candy-counter', x: 9, y: 2, w: 2, h: 1 },
    ],
  },
  {
    id: 'bakery', name: 'パンや', width: 16, height: 12, floor: T.FLOOR_WOOD, doorX: 7,
    outdoorDoor: { x: 61, y: 52 },
    clerk: { name: 'パンやさん', sprite: 'clerk', x: 12, y: 2, facing: 'down', line: 'いらっしゃいませ。ちょうど クロワッサンが やきあがったところだよ！' },
    furnishings: [
      { id: 'entry-rug', kind: 'shop-rug', style: 'bakery', x: 6, y: 9, w: 4, h: 1, solid: false, layer: 'decal' },
      { id: 'oven', kind: 'bakery-oven', x: 1, y: 1, w: 3, h: 1, name: 'レンガのパンがま', line: 'あたたかい レンガのかまの なかで パンが こんがり やけている。' },
      { id: 'loaves', kind: 'bakery-bread-rack', style: 'loaves', x: 5, y: 1, w: 4, h: 1, name: 'しょくパンのたな', line: 'やまがた しょくパンと フランスパンから こうばしい におい！' },
      { id: 'bread', kind: 'bakery-pastry-table', x: 2, y: 4, w: 3, h: 2, name: 'やきたてパンのだい', line: 'クロワッサンに メロンパン、あんパンが トレーに ならんでいる！' },
      { id: 'showcase', kind: 'bakery-showcase', x: 7, y: 4, w: 3, h: 2, name: 'サンドとケーキのケース', line: 'ガラスケースに たまごサンドや イチゴのケーキが ひえている。' },
      { id: 'small-bread', kind: 'bakery-pastry-table', style: 'baguettes', x: 11, y: 6, w: 3, h: 2, name: 'バゲットのかご', line: 'パリッと やけた フランスパンと やまがたパンが ならんでいる。' },
      { id: 'tray-stand', kind: 'bakery-tray-stand', x: 2, y: 8, w: 2, h: 1, name: 'トレーとトング', line: 'トレーと トングを もって すきな パンを えらべるよ。' },
      { id: 'counter', kind: 'bakery-counter', x: 10, y: 2, w: 2, h: 1 },
      { id: 'counter-side', kind: 'bakery-counter', style: 'side', x: 13, y: 2, w: 2, h: 1 },
      { id: 'plant', kind: 'cafe-plant', x: 1, y: 9, w: 1, h: 1 },
    ],
  },
  {
    id: 'cafe', name: 'きっさてん', width: 18, height: 14, floor: T.FLOOR_WOOD, doorX: 8,
    outdoorDoor: { x: 68, y: 52 },
    clerk: { name: 'てんいんさん', sprite: 'clerk', x: 14, y: 2, facing: 'down', line: 'いらっしゃいませ。ひきたての コーヒーと ケーキを どうぞ。' },
    furnishings: [
      { id: 'floor', kind: 'shop-floor', style: 'dark-wood', x: 1, y: 1, w: 16, h: 12, solid: false, layer: 'decal' },
      { id: 'entry-rug', kind: 'shop-rug', style: 'cafe', x: 7, y: 11, w: 4, h: 1, solid: false, layer: 'decal' },
      { id: 'lounge-rug', kind: 'shop-rug', style: 'cafe', x: 12, y: 8, w: 3, h: 2, solid: false, layer: 'decal' },
      { id: 'brew-bar', kind: 'cafe-brew-bar', x: 1, y: 1, w: 4, h: 1, name: 'コーヒーカウンター', line: 'エスプレッソマシンと サイフォンが コーヒーの いい かおりを たてている。' },
      { id: 'cake-case', kind: 'cafe-cake-case', x: 6, y: 1, w: 3, h: 1, name: 'スイーツのケース', line: 'ショートケーキと プリンが ならぶ ガラスの ショーケース。' },
      { id: 'counter', kind: 'cafe-counter', x: 12, y: 2, w: 2, h: 1 },
      { id: 'counter-side', kind: 'cafe-counter', style: 'side', x: 15, y: 2, w: 2, h: 1 },
      { id: 'chair-nw-l', kind: 'cafe-chair', style: 'right', x: 2, y: 4, w: 1, h: 1 },
      { id: 'table-north-west', kind: 'cafe-table', style: 'coffee-cake', x: 3, y: 4, w: 2, h: 1, name: 'コーヒーとケーキのせき', line: 'あたたかい コーヒーと イチゴのケーキが おかれた まどぎわの テーブル。' },
      { id: 'chair-nw-r', kind: 'cafe-chair', style: 'left', x: 5, y: 4, w: 1, h: 1 },
      { id: 'chair-nc-l', kind: 'cafe-chair', style: 'right', x: 7, y: 4, w: 1, h: 1 },
      { id: 'table-north-east', kind: 'cafe-table', style: 'morning-toast', x: 8, y: 4, w: 2, h: 1, name: 'モーニングのせき', line: 'あつぎり トーストと ブレンドコーヒーの せき。' },
      { id: 'chair-nc-r', kind: 'cafe-chair', style: 'left', x: 10, y: 4, w: 1, h: 1 },
      { id: 'chair-sw-l', kind: 'cafe-chair', style: 'right', x: 2, y: 8, w: 1, h: 1 },
      { id: 'table-south-west', kind: 'cafe-table', style: 'teapot', x: 3, y: 8, w: 2, h: 1, name: 'こうちゃのせき', line: 'ティーポットと カップが ならぶ ゆったりした テーブル。' },
      { id: 'chair-sw-r', kind: 'cafe-chair', style: 'left', x: 5, y: 8, w: 1, h: 1 },
      { id: 'chair-se-l', kind: 'cafe-chair', style: 'right', x: 7, y: 8, w: 1, h: 1 },
      { id: 'table-south-east', kind: 'cafe-table', style: 'soda', x: 8, y: 8, w: 2, h: 1, name: 'クリームソーダのせき', line: 'みどりいろの クリームソーダと プリンが のっている！' },
      { id: 'chair-se-r', kind: 'cafe-chair', style: 'left', x: 10, y: 8, w: 1, h: 1 },
      { id: 'sofa', kind: 'cafe-sofa', x: 12, y: 7, w: 3, h: 1 },
      { id: 'lounge-table', kind: 'cafe-table', style: 'coffee-cake', x: 12, y: 9, w: 2, h: 1 },
      { id: 'menu-board', kind: 'cafe-menu-board', x: 6, y: 11, w: 1, h: 1, name: 'メニューボード', line: 'きょうの ブレンドと いちごケーキの おしながきが かいてある。' },
      { id: 'plant', kind: 'cafe-plant', x: 15, y: 11, w: 1, h: 1 },
    ],
  },
  {
    id: 'pharmacy', name: 'くすりや', width: 16, height: 12, floor: T.FLOOR_CLASS, doorX: 7,
    outdoorDoor: { x: 75, y: 52 },
    clerk: { name: 'くすりやさん', sprite: 'clerk', x: 6, y: 3, facing: 'down', line: 'いらっしゃいませ。おくすりの そうだんでも お気軽に どうぞ。' },
    furnishings: [
      { id: 'floor', kind: 'shop-floor', style: 'tile-mint', x: 1, y: 1, w: 14, h: 10, solid: false, layer: 'decal' },
      { id: 'entry-rug', kind: 'shop-rug', style: 'pharmacy', x: 6, y: 9, w: 4, h: 1, solid: false, layer: 'decal' },
      { id: 'wait-mat', kind: 'shop-rug', style: 'pharmacy', x: 5, y: 4, w: 3, h: 1, solid: false, layer: 'decal' },
      { id: 'medicine', kind: 'pharmacy-med-shelf', x: 1, y: 1, w: 4, h: 1, name: 'くすりのたな', line: 'かぜぐすりや シロップびん、じょうざいシートが きれいに わかれている。' },
      { id: 'care-corner', kind: 'pharmacy-care-shelf', x: 6, y: 1, w: 4, h: 1 },
      { id: 'counter', kind: 'pharmacy-counter', x: 1, y: 3, w: 5, h: 1 },
      { id: 'counter-side', kind: 'pharmacy-counter', style: 'side', x: 7, y: 3, w: 4, h: 1 },
      { id: 'waiting-bench', kind: 'pharmacy-bench', x: 11, y: 5, w: 2, h: 1 },
      { id: 'daily-goods', kind: 'pharmacy-daily-shelf', x: 2, y: 7, w: 3, h: 2, name: 'にちようひんのたな', line: 'ティッシュの ５はこパックや トイレットペーパー、せっけんが ならんでいる。' },
      { id: 'first-aid', kind: 'pharmacy-low-care', x: 11, y: 8, w: 3, h: 1, name: 'えいせいひんのたな', line: 'きゅうきゅうばこや しょうどくえき、ばんそうこうが そろっている。' },
    ],
  },
];
