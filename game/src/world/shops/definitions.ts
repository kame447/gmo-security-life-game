import type { Facing } from '../../core/coords';
import type { ObjectDef } from '../../core/types';
import { T } from '../tiles';

export interface ShopFurnishing extends Pick<ObjectDef, 'kind' | 'x' | 'y' | 'w' | 'h' | 'facing'> {
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
    id: 'greengrocer', name: '八百屋', width: 16, height: 12, floor: T.FLOOR_CLASS, doorX: 7,
    outdoorDoor: { x: 33, y: 52 },
    clerk: { name: '八百屋の店員', sprite: 'shopkeeper', x: 12, y: 2, facing: 'down', line: 'いらっしゃい。今日はキャベツもみかんも採れたてだよ！' },
    furnishings: [
      { id: 'floor', kind: 'shop-floor', style: 'doma', x: 1, y: 1, w: 14, h: 10, solid: false, layer: 'decal' },
      { id: 'entry-rug', kind: 'shop-rug', style: 'greengrocer', x: 7, y: 8, w: 2, h: 2, solid: false, layer: 'decal' },
      { id: 'cooler', kind: 'greengrocer-chill-case', x: 1, y: 1, w: 3, h: 1, name: '冷蔵ケース', line: 'みずみずしいキャベツや大根が冷えている。' },
      { id: 'back-roots', kind: 'greengrocer-produce-stand', style: 'roots', x: 5, y: 1, w: 4, h: 1 },
      { id: 'vegetables', kind: 'greengrocer-produce-stand', style: 'greens', x: 1, y: 4, w: 3, h: 2, name: '野菜の木箱', line: '青々としたキャベツにトマト、にんじんが木箱にぎっしり！' },
      { id: 'baskets', kind: 'greengrocer-basket-rack', x: 1, y: 7, w: 3, h: 1, name: 'かごの野菜', line: '丸いキャベツやトマト、きゅうりがかごに並んでいる。' },
      { id: 'crates', kind: 'greengrocer-produce-stand', style: 'roots', x: 12, y: 4, w: 3, h: 2, name: '根菜の木箱', line: '太い大根とにんじんが山盛りに積まれている。' },
      { id: 'fruit', kind: 'greengrocer-fruit-table', x: 12, y: 6, w: 3, h: 2, name: '果物の台', line: '赤いりんご、甘いみかん、バナナもかごいっぱい！' },
      { id: 'counter', kind: 'greengrocer-counter', x: 10, y: 2, w: 2, h: 1 },
    ],
  },
  {
    id: 'bookstore', name: '本屋', width: 18, height: 12, floor: T.FLOOR_WOOD, doorX: 8,
    outdoorDoor: { x: 40, y: 52 },
    clerk: { name: '本屋の店員', sprite: 'clerk', x: 14, y: 2, facing: 'down', line: 'いらっしゃいませ。お探しの本があれば声をかけてね。' },
    furnishings: [
      { id: 'entry-rug', kind: 'shop-rug', style: 'bookstore', x: 7, y: 8, w: 4, h: 2, solid: false, layer: 'decal' },
      { id: 'back-books-west', kind: 'bookstore-tall-shelf', style: 'a', x: 1, y: 1, w: 4, h: 1 },
      { id: 'back-books-east', kind: 'bookstore-tall-shelf', style: 'b', x: 6, y: 1, w: 4, h: 1 },
      { id: 'picture-books', kind: 'bookstore-picture-shelf', x: 2, y: 4, w: 3, h: 2, name: '絵本の棚', line: '楽しい絵の表紙が見えるように、絵本が並んでいる。' },
      { id: 'flat-novels', kind: 'bookstore-flat-table', style: 'novels', x: 7, y: 4, w: 3, h: 2, name: '平積みの台', line: 'おすすめの紹介文と一緒に、話題の本が平積みにされている。' },
      { id: 'comics-table', kind: 'bookstore-flat-table', style: 'comics', x: 12, y: 5, w: 3, h: 2, name: '新刊の台', line: '新刊の漫画や文庫本がきれいに積まれている。' },
      { id: 'magazines', kind: 'bookstore-magazine-rack', x: 2, y: 8, w: 3, h: 1, name: '雑誌の棚', line: '週刊誌や趣味の雑誌が見やすく並んでいる。' },
      { id: 'counter', kind: 'bookstore-counter', x: 12, y: 2, w: 2, h: 1 },
      { id: 'counter-side', kind: 'bookstore-counter', style: 'side', x: 15, y: 2, w: 2, h: 1 },
      { id: 'plant', kind: 'plant', x: 1, y: 3, w: 1, h: 1 },
    ],
  },
  {
    id: 'candy', name: '駄菓子屋', width: 14, height: 10, floor: T.FLOOR_WOOD, doorX: 6,
    outdoorDoor: { x: 47, y: 52 },
    clerk: { name: 'おっちゃん', sprite: 'shopkeeper', x: 11, y: 2, facing: 'down', line: 'いらっしゃい。小銭を握って、ゆっくり選んでいきな。' },
    furnishings: [
      { id: 'entry-rug', kind: 'shop-rug', style: 'candy', x: 6, y: 7, w: 2, h: 1, solid: false, layer: 'decal' },
      { id: 'jar-stand', kind: 'candy-jar-stand', x: 1, y: 1, w: 3, h: 1, name: 'あめ玉の瓶', line: '透明なガラス瓶に、色とりどりのあめ玉がぎっしり！' },
      { id: 'hanging-rack', kind: 'candy-hanging-rack', x: 5, y: 1, w: 3, h: 1, name: '当てくじとキャンディ', line: 'つり下げたお菓子と当てくじ、ペロペロキャンディが並んでいる。' },
      { id: 'sweets', kind: 'candy-box-rack', x: 1, y: 4, w: 3, h: 2, name: '駄菓子の箱棚', line: '10円や30円のお菓子やラムネが、木箱に並んでいる。' },
      { id: 'snacks', kind: 'candy-low-bins', x: 9, y: 5, w: 3, h: 2, name: '低めのおやつ箱', line: '大きなペロペロキャンディやラムネ、スナックが手に取れる！' },
      { id: 'counter', kind: 'candy-counter', x: 9, y: 2, w: 2, h: 1 },
    ],
  },
  {
    id: 'bakery', name: 'パン屋', width: 16, height: 12, floor: T.FLOOR_WOOD, doorX: 7,
    outdoorDoor: { x: 61, y: 52 },
    clerk: { name: 'パン屋の店員', sprite: 'clerk', x: 12, y: 2, facing: 'down', line: 'いらっしゃいませ。ちょうどクロワッサンが焼けたところだよ！' },
    furnishings: [
      { id: 'entry-rug', kind: 'shop-rug', style: 'bakery', x: 6, y: 9, w: 4, h: 1, solid: false, layer: 'decal' },
      { id: 'oven', kind: 'bakery-oven', x: 1, y: 1, w: 3, h: 1, name: 'レンガのパン窯', line: '温かいレンガの窯の中で、パンがこんがり焼けている。' },
      { id: 'loaves', kind: 'bakery-bread-rack', style: 'loaves', x: 5, y: 1, w: 4, h: 1, name: '食パンの棚', line: '山形の食パンとフランスパンから、香ばしい匂いがする！' },
      { id: 'bread', kind: 'bakery-pastry-table', x: 2, y: 4, w: 3, h: 2, name: '焼きたてパンの台', line: 'クロワッサンにメロンパン、あんパンがトレーに並んでいる！' },
      { id: 'showcase', kind: 'bakery-showcase', x: 7, y: 4, w: 3, h: 2, name: 'サンドとケーキのケース', line: 'ガラスケースで、卵サンドやいちごのケーキが冷えている。' },
      { id: 'small-bread', kind: 'bakery-pastry-table', style: 'baguettes', x: 11, y: 6, w: 3, h: 2, name: 'バゲットのかご', line: 'パリッと焼けたフランスパンと山形パンが並んでいる。' },
      { id: 'tray-stand', kind: 'bakery-tray-stand', x: 2, y: 8, w: 2, h: 1, name: 'トレーとトング', line: 'トレーとトングを持って、好きなパンを選べるよ。' },
      { id: 'counter', kind: 'bakery-counter', x: 10, y: 2, w: 2, h: 1 },
      { id: 'counter-side', kind: 'bakery-counter', style: 'side', x: 13, y: 2, w: 2, h: 1 },
      { id: 'plant', kind: 'cafe-plant', x: 1, y: 9, w: 1, h: 1 },
    ],
  },
  {
    id: 'cafe', name: '喫茶店', width: 18, height: 14, floor: T.FLOOR_WOOD, doorX: 8,
    outdoorDoor: { x: 68, y: 52 },
    clerk: { name: '店員さん', sprite: 'clerk', x: 14, y: 2, facing: 'down', line: 'いらっしゃいませ。ひきたてのコーヒーとケーキをどうぞ。' },
    furnishings: [
      { id: 'floor', kind: 'shop-floor', style: 'dark-wood', x: 1, y: 1, w: 16, h: 12, solid: false, layer: 'decal' },
      { id: 'entry-rug', kind: 'shop-rug', style: 'cafe', x: 7, y: 11, w: 4, h: 1, solid: false, layer: 'decal' },
      { id: 'lounge-rug', kind: 'shop-rug', style: 'cafe', x: 12, y: 8, w: 3, h: 2, solid: false, layer: 'decal' },
      { id: 'brew-bar', kind: 'cafe-brew-bar', x: 1, y: 1, w: 4, h: 1, name: 'コーヒーカウンター', line: 'エスプレッソマシンとサイフォンが、コーヒーのよい香りを立てている。' },
      { id: 'cake-case', kind: 'cafe-cake-case', x: 6, y: 1, w: 3, h: 1, name: 'スイーツのケース', line: 'ショートケーキとプリンが並ぶ、ガラスのショーケース。' },
      { id: 'counter', kind: 'cafe-counter', x: 12, y: 2, w: 2, h: 1 },
      { id: 'counter-side', kind: 'cafe-counter', style: 'side', x: 15, y: 2, w: 2, h: 1 },
      { id: 'chair-nw-l', kind: 'cafe-chair', facing: 'right', x: 2, y: 4, w: 1, h: 1 },
      { id: 'table-north-west', kind: 'cafe-table', style: 'coffee-cake', x: 3, y: 4, w: 2, h: 1, name: 'コーヒーとケーキの席', line: '温かいコーヒーといちごのケーキが置かれた、窓際のテーブル。' },
      { id: 'chair-nw-r', kind: 'cafe-chair', facing: 'left', x: 5, y: 4, w: 1, h: 1, layer: 'decal' },
      { id: 'chair-nc-l', kind: 'cafe-chair', facing: 'right', x: 7, y: 4, w: 1, h: 1 },
      { id: 'table-north-east', kind: 'cafe-table', style: 'morning-toast', x: 8, y: 4, w: 2, h: 1, name: 'モーニングの席', line: '厚切りトーストとブレンドコーヒーの席。' },
      { id: 'chair-nc-r', kind: 'cafe-chair', facing: 'left', x: 10, y: 4, w: 1, h: 1 },
      { id: 'chair-sw-l', kind: 'cafe-chair', facing: 'right', x: 2, y: 8, w: 1, h: 1 },
      { id: 'table-south-west', kind: 'cafe-table', style: 'teapot', x: 3, y: 8, w: 2, h: 1, name: '紅茶の席', line: 'ティーポットとカップが並ぶ、ゆったりしたテーブル。' },
      { id: 'chair-sw-r', kind: 'cafe-chair', facing: 'left', x: 5, y: 8, w: 1, h: 1 },
      { id: 'chair-se-l', kind: 'cafe-chair', facing: 'right', x: 7, y: 8, w: 1, h: 1 },
      { id: 'table-south-east', kind: 'cafe-table', style: 'soda', x: 8, y: 8, w: 2, h: 1, name: 'クリームソーダの席', line: '緑色のクリームソーダとプリンが載っている！' },
      { id: 'chair-se-r', kind: 'cafe-chair', facing: 'left', x: 10, y: 8, w: 1, h: 1, layer: 'decal' },
      { id: 'sofa', kind: 'cafe-sofa', x: 12, y: 7, w: 3, h: 1 },
      { id: 'lounge-table', kind: 'cafe-table', style: 'coffee-cake', x: 12, y: 9, w: 2, h: 1 },
      { id: 'menu-board', kind: 'cafe-menu-board', x: 6, y: 11, w: 1, h: 1, name: 'メニューボード', line: '今日のブレンドと、いちごケーキのメニューが書いてある。' },
      { id: 'plant', kind: 'cafe-plant', x: 15, y: 11, w: 1, h: 1 },
    ],
  },
  {
    id: 'pharmacy', name: '薬局', width: 16, height: 12, floor: T.FLOOR_CLASS, doorX: 7,
    outdoorDoor: { x: 75, y: 52 },
    clerk: { name: '薬局の店員', sprite: 'clerk', x: 6, y: 3, facing: 'down', line: 'いらっしゃいませ。お薬の相談もお気軽にどうぞ。' },
    furnishings: [
      { id: 'floor', kind: 'shop-floor', style: 'tile-mint', x: 1, y: 1, w: 14, h: 10, solid: false, layer: 'decal' },
      { id: 'entry-rug', kind: 'shop-rug', style: 'pharmacy', x: 6, y: 9, w: 4, h: 1, solid: false, layer: 'decal' },
      { id: 'wait-mat', kind: 'shop-rug', style: 'pharmacy', x: 5, y: 4, w: 3, h: 1, solid: false, layer: 'decal' },
      { id: 'medicine', kind: 'pharmacy-med-shelf', x: 1, y: 1, w: 4, h: 1, name: '薬の棚', line: '風邪薬やシロップの瓶、錠剤のシートがきれいに分けられている。' },
      { id: 'care-corner', kind: 'pharmacy-care-shelf', x: 6, y: 1, w: 4, h: 1 },
      { id: 'counter', kind: 'pharmacy-counter', x: 1, y: 3, w: 5, h: 1 },
      { id: 'counter-side', kind: 'pharmacy-counter', style: 'side', x: 7, y: 3, w: 4, h: 1 },
      { id: 'waiting-bench', kind: 'pharmacy-bench', x: 11, y: 5, w: 2, h: 1 },
      { id: 'daily-goods', kind: 'pharmacy-daily-shelf', x: 2, y: 7, w: 3, h: 2, name: '日用品の棚', line: 'ティッシュの5箱パックやトイレットペーパー、石けんが並んでいる。' },
      { id: 'first-aid', kind: 'pharmacy-low-care', x: 11, y: 8, w: 3, h: 1, name: '衛生用品の棚', line: '救急箱や消毒液、ばんそうこうがそろっている。' },
    ],
  },
];
