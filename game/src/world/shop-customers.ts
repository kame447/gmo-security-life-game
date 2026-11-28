import type { InteractionDef } from '../core/types';
import type { Facing } from '../core/coords';

type Customer = { id: string; name: string; x: number; y: number; sprite: string; facing: Facing; lines: string[]; eventKey?: string };

/** 買い物客は棚の前、喫茶店の客は椅子の上。会話から買い物やお使いは始めない。 */
const CUSTOMERS: Readonly<Record<string, readonly Customer[]>> = {
  konbini: [{ id: 'after-school', name: '買い物中の生徒', x: 6, y: 2, facing: 'up', sprite: 'classmate', lines: ['部活の帰りなんだ。こっちのお茶にしようかな。冷えていておいしそう。'] }],
  greengrocer: [{ id: 'dinner', name: '買い物中の人', x: 11, y: 7, facing: 'right', sprite: 'mother', lines: ['今日はどの果物を買おうかな。りんごもみかんも色がきれいだね。'] }],
  bookstore: [{ id: 'reader', name: '本を探す友達', x: 8, y: 6, facing: 'up', sprite: 'classmate', eventKey: 'optional.bookstore.friend', lines: ['この本、面白そうだね。気に入った本を教え合うのも楽しいよ。'] }],
  candy: [{ id: 'snack', name: '駄菓子を選ぶ子', x: 4, y: 5, facing: 'left', sprite: 'friend', lines: ['おこづかいで何を買えるか、計算しているんだ。選ぶ時間も楽しいね。'] }],
  bakery: [{ id: 'bread', name: 'パンを選ぶ人', x: 3, y: 6, facing: 'up', sprite: 'mother', lines: ['焼きたての香りに誘われて来ちゃった。家族へのお土産も選ぼうかな。'] }],
  cafe: [
    { id: 'reader', name: '読書中の客', x: 5, y: 4, facing: 'left', sprite: 'grandma-reading-seated', lines: ['窓際のこの席で本を読むのが楽しみなの。少しずつ、ゆっくり読んでいるのよ。'] },
    { id: 'friend', name: '喫茶店の友達', x: 10, y: 8, facing: 'left', sprite: 'friend-seated', eventKey: 'optional.cafe.friend', lines: ['ここ、落ち着くね。席に座って、ひと息ついていたんだ。よかったら近況を聞かせて。'] },
  ],
  pharmacy: [{ id: 'care', name: '日用品を選ぶ人', x: 4, y: 6, facing: 'down', sprite: 'guard', lines: ['家の日用品を補充しに来たんだ。必要なものをメモしておくと、買い忘れが減るね。'] }],
};

export function shopCustomers(shopId: string): InteractionDef[] {
  return (CUSTOMERS[shopId] ?? []).map(customer => ({
    id: `${shopId}-customer-${customer.id}`, kind: 'npc', name: customer.name,
    x: customer.x, y: customer.y, sprite: customer.sprite, facing: customer.facing, solid: true,
    eventKey: customer.eventKey ?? `customer.${shopId}.${customer.id}`, lines: [...customer.lines],
  }));
}
