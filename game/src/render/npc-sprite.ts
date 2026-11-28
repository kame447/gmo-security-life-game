/**
 * NPC のドット絵。主人公（player-sprite.ts）と同じく、1 文字 = 1 ドットの図案をコードで持つ。
 *
 * 子ども（ともだち・クラスのともだち）は主人公の頭・胴の図案を、主人公が選べない色で使う。
 * 大人は頭を 12×12 と小さくし、胴 9 行・脚 5 行で背を高く見せる。ねこは別の図案。
 * 大きさは主人公と同じ 18×26、足元が下端。左向きは右向きの図案を左右反転して描く。
 */
import type { Facing } from '../core/coords';
import type { C2D } from './draw';
import { BODIES, HEADS, PLAYER_H, PLAYER_W, paint, viewOf, type Grid, type Palette, type View } from './player-sprite';

export const NPC_W = PLAYER_W;
export const NPC_H = PLAYER_H;

type Views = Record<View, Grid>;

/** 大人の頭：幅 12 × 12 行。キャンバスの x=3 から置く。 */
export const ADULT_HEADS: Record<string, Views> = {
  short: {
    front: [
      '...oooooo...',
      '.oohhhHhhoo.',
      'ohhHHhhhhhho',
      'ohhhhhhhhhdo',
      'ohsshhhsssdo',
      'osssssssssso',
      'ossessssesso',
      'ossessssesso',
      'oSssssssssSo',
      '.osssmmssso.',
      '..osssssso..',
      '...ooSSoo...',
    ],
    back: [
      '...oooooo...',
      '.oohhhHhhoo.',
      'ohhHHhhhhhho',
      'ohhhhhhhhhdo',
      'ohhhhhhhhhdo',
      'ohhhhhHhhhdo',
      'ohdhhhhhhddo',
      'ohddhhhhdddo',
      'oSddddddddSo',
      '.osssssssso.',
      '..osssssso..',
      '...ooSSoo...',
    ],
    side: [
      '..oooooo....',
      '.ohhhHhhoo..',
      'ohhHHhhhhho.',
      'ohhhhhhhhhho',
      'ohdhhhhhssho',
      'ohdhhhssssso',
      'ohdhhSssseso',
      'ohddhSssseso',
      'oddhhsssssso',
      '.oddossssmo.',
      '..oooossso..',
      '.....oSSo...',
    ],
  },
  long: {
    front: [
      '...oooooo...',
      '.oohhHhhhoo.',
      'ohhHHhhhhhho',
      'ohhhhhhhhhdo',
      'ohhssshhhhdo',
      'ohssssssshdo',
      'ohsessssesdo',
      'ohsessssesdo',
      'ohbssssssbdo',
      'ohdssmmsssdo',
      'ohdosssssodo',
      'oddooSSooddo',
    ],
    back: [
      '...oooooo...',
      '.oohhHhhhoo.',
      'ohhHHhhhhhho',
      'ohhhhhhhhhdo',
      'ohhhhhHhhhdo',
      'ohhhhhhhhhdo',
      'ohhhhhhhhhdo',
      'ohdhhhhhhddo',
      'ohdhhhhhhddo',
      'ohddhhhhdddo',
      'ohdddddddddo',
      'oooooooooooo',
    ],
    side: [
      '..oooooo....',
      '.ohhhHhhoo..',
      'ohhHHhhhhho.',
      'ohhhhhhhhhho',
      'ohhhhhhsssho',
      'ohhhhhssssso',
      'ohhhhSssseso',
      'ohhhhSssseso',
      'ohhhhssssbso',
      'ohdhhosssmso',
      'ohddhhossso.',
      'oddddooSSo..',
    ],
  },
  bun: {
    front: [
      '....oooo....',
      '...ohHhho...',
      '.oohhhhhhoo.',
      'ohhHhhhhhhdo',
      'ohhhhhhhhhdo',
      'ohssssssssdo',
      'ohseesseesdo',
      'ohssssssssdo',
      'ohbssssssbdo',
      'oSsssmmsssSo',
      '.osssssssso.',
      '..oooSSooo..',
    ],
    back: [
      '....oooo....',
      '...ohHhho...',
      '.oohdhhdhoo.',
      'ohhHhhhhhhdo',
      'ohhhhhhhhhdo',
      'ohhhhhhhhhdo',
      'ohhhhhhhhhdo',
      'ohdhhhhhhddo',
      'oSddddddddSo',
      'oSssssssssSo',
      '.osssssssso.',
      '..oooSSooo..',
    ],
    side: [
      '.oooo.......',
      'ohHhhoooo...',
      'ohhhohhhhoo.',
      '.ohhhhHhhhho',
      'ohhhhhhhhsso',
      'ohhhhhssssso',
      'ohhhhSssseeo',
      'ohhhhsssssso',
      'ohhhhssssbso',
      'odhhhosssmso',
      '.oddhhossso.',
      '..oooooSSo..',
    ],
  },
  ponytail: {
    front: [
      '...oooooo...',
      '.oohhHhhhoo.',
      'ohhHHhhhhhho',
      'ohhhhhhhhhdo',
      'ohhssshhssdo',
      'ohssssssssdo',
      'ohsessssesdo',
      'ohsessssesdo',
      'ohbssssssbdo',
      '.osssmmssso.',
      '..osssssso..',
      '...ooSSoo...',
    ],
    back: [
      '...oooooo...',
      '.oohhHhhhoo.',
      'ohhHHhhhhhho',
      'ohhhhhhhhhdo',
      'ohhhhrrhhhdo',
      'ohhhhhhhhhdo',
      'ohdhhhhhhddo',
      'oSddhhhhddSo',
      'oSssohhossSo',
      '.ossohhosso.',
      '..osohhoso..',
      '...ooddoo...',
    ],
    side: [
      '..oooooo....',
      '.ohhhHhhoo..',
      'ohhHHhhhhho.',
      'ohhhhhhhhhho',
      'orhhhhhsssho',
      'hohhhhssssso',
      'hohhhSssseso',
      'hdohhSssseso',
      'do.ohssssbso',
      '...ohosssmso',
      '....oosssso.',
      '......oSSo..',
    ],
  },
};

/** 頭の上に重ねる帽子の図案。'.' は下の絵を残す。 */
const HATS: Record<string, Views> = {
  // 大人の帽子：幅 14。キャンバスの x=2 から置き、つばを頭より 1 ドット広くする。
  cap: {
    front: [
      '....oooooo....',
      '...ouuYYuuo...',
      '..ouuuuuuuuo..',
      '.oUUUUUUUUUUo.',
    ],
    back: [
      '....oooooo....',
      '...ouuuuuuo...',
      '..ouuuuuuuuo..',
      '.oUUUUUUUUUUo.',
    ],
    side: [
      '...oooooo.....',
      '..ouuuuYuo....',
      '.ouuuuuuuuo...',
      '.oUUUUUUUUUUo.',
    ],
  },
  // 子どもの帽子：幅 16。主人公の頭と同じ x=1 から置く。
  'kid-cap': {
    front: [
      '....oooooooo....',
      '...ouuuuuuuuo...',
      '..ouuuuYYuuuuo..',
      '..oUUUUUUUUUUo..',
      '.oUUUUUUUUUUUUo.',
    ],
    back: [
      '....oooooooo....',
      '...ouuuuuuuuo...',
      '..ouuuuuuuuuuo..',
      '..ouuuuuuuuuuo..',
      '.oUUUUUUUUUUUUo.',
    ],
    side: [
      '...oooooooo.....',
      '..ouuuuuuuuo....',
      '.ouuuuuuuYuuo...',
      '.ouuuuuuuuuuUo..',
      '.oUUUUUUUUUUUUUo',
    ],
  },
};

/** 大人の胴：幅 18 × 9 行。キャンバスの y=12 から置く。 */
export const ADULT_BODIES: Record<string, Views> = {
  // 上着とシャツ（えきいんさんはネクタイ、てんいんさんは胸の帯と名札を重ねる）
  coat: {
    front: [
      '....oowwsswwoo....',
      '...occwwsswwcco...',
      '..occoccccccocco..',
      '..occoccccccocco..',
      '..oCcoccccccocCo..',
      '..oCcoccccccocCo..',
      '..osooCCCCCCooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    back: [
      '....ooccccccoo....',
      '...occcccccccco...',
      '..occoccccccocco..',
      '..occoccccccocco..',
      '..oCcoccccccocCo..',
      '..oCcoccccccocCo..',
      '..osooCCCCCCooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    side: [
      '......oowwsso.....',
      '......occwwco.....',
      '......occCccco....',
      '......ocoCcoco....',
      '......ocoCcoco....',
      '......oCoCcoco....',
      '......oCosocco....',
      '......oposoppo....',
      '......oppppPPo....',
    ],
  },
  tie: {
    front: [
      '....oowwsswwoo....',
      '...occwwrrwwcco...',
      '..occoccrrccocco..',
      '..occocWrrWcocco..',
      '..oCcoccrrccocCo..',
      '..oCcocWccWcocCo..',
      '..osooCCCCCCooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    back: [
      '....ooccccccoo....',
      '...occcccccccco...',
      '..occoccccccocco..',
      '..occoccccccocco..',
      '..oCcoccccccocCo..',
      '..oCcoccccccocCo..',
      '..osooCCCCCCooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    side: [
      '......oowwwro.....',
      '......occwwro.....',
      '......occCccro....',
      '......ocoCcoWo....',
      '......ocoCcoco....',
      '......oCoCcoWo....',
      '......oCosocco....',
      '......oposoppo....',
      '......oppppPPo....',
    ],
  },
  stripe: {
    front: [
      '....oowwsswwoo....',
      '...occwwsswwcco...',
      '..occoLLLLLLocco..',
      '..occoccccccocco..',
      '..oCcoccccnnocCo..',
      '..oCcoccccccocCo..',
      '..osooCCCCCCooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    back: [
      '....ooccccccoo....',
      '...occcccccccco...',
      '..occoLLLLLLocco..',
      '..occoccccccocco..',
      '..oCcoccccccocCo..',
      '..oCcoccccccocCo..',
      '..osooCCCCCCooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    side: [
      '......oowwsso.....',
      '......occwwco.....',
      '......oLLLLLLo....',
      '......ocoCcoco....',
      '......ocoCcono....',
      '......oCoCcoco....',
      '......oCosocco....',
      '......oposoppo....',
      '......oppppPPo....',
    ],
  },
  // 前かけ（だがしやさん）
  apron: {
    front: [
      '....oowwsswwoo....',
      '...occwaaaawcco...',
      '..occoaaaaaaocco..',
      '..occoaaAAaaocco..',
      '..oCcoaaAAaaocCo..',
      '..oCcoaaaaaaocCo..',
      '..osooaaaaaaooso..',
      '..ossoaaaaaaosso..',
      '....oAaaaaaaAo....',
    ],
    back: [
      '....ooccccccoo....',
      '...occaccccacco...',
      '..occocaccacocco..',
      '..occoccaaccocco..',
      '..oCcoccaaccocCo..',
      '..oCcocaccacocCo..',
      '..osooaAaaAaooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    side: [
      '......oowwsso.....',
      '......occwaao.....',
      '......occCcaao....',
      '......ocoCcaao....',
      '......ocoCcaao....',
      '......oCoCcaao....',
      '......oCosoaao....',
      '......oposoaao....',
      '......oppppAAo....',
    ],
  },
  // 反射材の帯がついたベスト（みまもりのひと）
  vest: {
    front: [
      '....oowwsswwoo....',
      '...ocvvwsswvvco...',
      '..occovvvvvvocco..',
      '..occoVVVVVVocco..',
      '..oCcovvvvvvocCo..',
      '..oCcoVVVVVVocCo..',
      '..osoovvvvvvooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    back: [
      '....oovvvvvvoo....',
      '...ocvvvvvvvvco...',
      '..occovvvvvvocco..',
      '..occoVVVVVVocco..',
      '..oCcovvvvvvocCo..',
      '..oCcoVVVVVVocCo..',
      '..osoovvvvvvooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    side: [
      '......oowwvvo.....',
      '......ocvvvvo.....',
      '......ocvCcvvo....',
      '......ocoCcVVo....',
      '......ocoCcvvo....',
      '......oCoCcVVo....',
      '......oCosovvo....',
      '......oposoppo....',
      '......oppppPPo....',
    ],
  },
  // 上着とスカート（おかあさん）
  skirt: {
    front: [
      '....oowwsswwoo....',
      '...occwwsswwcco...',
      '..occoccccccocco..',
      '..occoccccccocco..',
      '..oCcoccccccocCo..',
      '..oCcozzzzzzocCo..',
      '..osoozzzzzzooso..',
      '..ossozzzzzzosso..',
      '...ozzZzzzzZzzo...',
    ],
    back: [
      '....ooccccccoo....',
      '...occcccccccco...',
      '..occoccccccocco..',
      '..occoccccccocco..',
      '..oCcoccccccocCo..',
      '..oCcozzzzzzocCo..',
      '..osoozzzzzzooso..',
      '..ossozzzzzzosso..',
      '...ozzZzzzzZzzo...',
    ],
    side: [
      '......oowwsso.....',
      '......occwwco.....',
      '......occCccco....',
      '......ocoCcoco....',
      '......ocoCcoco....',
      '......ozoCcozo....',
      '......ozosozzo....',
      '.....ozzzzzzzo....',
      '.....ozzzzzZZo....',
    ],
  },
  // カーディガンと長いスカート（おばあさん・せんせいは上だけ同じ形）
  cardigan: {
    front: [
      '....oowwsswwoo....',
      '...occwwsswwcco...',
      '..occocwttwcocco..',
      '..occocttttcocco..',
      '..oCcocttttcocCo..',
      '..oCcocttttcocCo..',
      '..osooCCCCCCooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    back: [
      '....ooccccccoo....',
      '...occcccccccco...',
      '..occoccccccocco..',
      '..occoccccccocco..',
      '..oCcoccccccocCo..',
      '..oCcoccccccocCo..',
      '..osooCCCCCCooso..',
      '..ossopppppposso..',
      '....oppPPppppo....',
    ],
    side: [
      '......oowwsso.....',
      '......occwwto.....',
      '......occCccto....',
      '......ocoCcoto....',
      '......ocoCcoto....',
      '......oCoCcoto....',
      '......oCosocco....',
      '......oposoppo....',
      '......oppppPPo....',
    ],
  },
  'cardigan-skirt': {
    front: [
      '....oowwsswwoo....',
      '...occwwsswwcco...',
      '..occocwttwcocco..',
      '..occocttttcocco..',
      '..oCcocttttcocCo..',
      '..oCcozzzzzzocCo..',
      '..osoozzzzzzooso..',
      '..ossozzzzzzosso..',
      '...ozzZzzzzZzzo...',
    ],
    back: [
      '....ooccccccoo....',
      '...occcccccccco...',
      '..occoccccccocco..',
      '..occoccccccocco..',
      '..oCcoccccccocCo..',
      '..oCcozzzzzzocCo..',
      '..osoozzzzzzooso..',
      '..ossozzzzzzosso..',
      '...ozzZzzzzZzzo...',
    ],
    side: [
      '......oowwsso.....',
      '......occwwto.....',
      '......occCccto....',
      '......ocoCcoto....',
      '......ocoCcoto....',
      '......ozoCcozo....',
      '......ozosozzo....',
      '.....ozzzzzzzo....',
      '.....ozzzzzZZo....',
    ],
  },
};

/** 長いスカートのすそ：幅 18 × 3 行。脚の上から y=21 に重ね、靴だけを見せる（おかあさん）。 */
export const LONG_HEM: Views = {
  front: ['...ozzzzzzzzzzo...', '..ozzZzzzzzzZzzo..', '..oooooooooooooo..'],
  back: ['...ozzzzzzzzzzo...', '..ozzZzzzzzzZzzo..', '..oooooooooooooo..'],
  side: ['.....ozzzzzzzo....', '....ozzzzzzZZzo...', '....ooooooooooo...'],
};

/** ねこ：正面・背面は幅 12 × 14 行で x=3・y=10、横向きは幅 16 × 12 行で x=1・y=12 から置く。頭を大きく、目を光らせて丸みを出す。脚としっぽは別に描く。 */
export const CAT: Views = {
  front: [
    '.oo......oo.',
    'oppo....oppo',
    'ohpho..ohpho',
    'ohhhoooohhho',
    'ohhhdhhdhhho',
    'ohEehhhhEeho',
    'oheehhhheeho',
    'obhhhnnhhhbo',
    '.ohhmhhmhho.',
    '..oohhhhoo..',
    '..ohLLLLho..',
    '.ohhLLLLhho.',
    '.ohhhLLhhho.',
    '.oohhhhhhoo.',
  ],
  back: [
    '.oo......oo.',
    'oHho....ohHo',
    'ohhho..ohhho',
    'ohhhoooohhho',
    'ohhhdhhdhhho',
    'ohhhhddhhhho',
    'ohhhhhhhhhho',
    'ohhhhhhhhhho',
    '.ohhhhhhhho.',
    '..oohhhhoo..',
    '..ohhdhhho..',
    '.ohhhhhhhho.',
    '.ohhdhhdhho.',
    '.oohhhhhhoo.',
  ],
  side: [
    '.......oo....oo.',
    '.oo...oho...opho',
    'odo...ohhoooohho',
    'oho...ohhhhhhhho',
    '.oho..ohhdhdhhho',
    '.oho..ohhhhhhEeo',
    '..ooooohhhhhhheo',
    '..ohhhohbhhhhhhn',
    '.ohdhdhohhhhhmho',
    '.ohhhhhhoooooo..',
    '.ohhhhhhLLo.....',
    '..oooooooo......',
  ],
};

/** 正面のしっぽ（体の後ろ、右側）と背面のしっぽ（体の手前、まんなか）。 */
const CAT_TAIL: Record<'front' | 'back', Grid> = {
  front: ['..oo', '.oho', '.oho', 'ohho', 'oho.', 'ohho', '.ooo'],
  back: ['.oo.', 'oddo', 'ohho', 'ohho', 'oho.'],
};

interface Recipe {
  adult: boolean;
  head: Views;
  body: Views;
  hats?: readonly string[];
  /** 脚の上に重ねる長いすそ。 */
  hem?: Views;
  /** 脚の上の部分の色の記号（ズボン 'p'、素足 's'、ストッキング 'q'）。 */
  legs: string;
  colors: Palette;
}

/** 輪郭・肌・目などは主人公と同じ色にそろえる。 */
const BASE: Palette = {
  o: '#3b2318',
  s: '#f7c99e', S: '#dfa47a', b: '#ef9d88',
  e: '#2b1a14', w: '#fbf8f0', m: '#c0574d',
  t: '#f6f2e6', T: '#d9d3c2', y: '#f0b134', W: '#f1e3a6',
  x: '#f6f4ee', k: '#4a3a33', K: '#f2f2ee',
  r: '#e2566a', R: '#b33a4c',
};

/** 主人公の外見で選べない色だけを使う（主人公と同じ見た目にしない）。 */
const RECIPES: Record<string, Recipe> = {
  mother: {
    adult: true, head: ADULT_HEADS.long, body: ADULT_BODIES.skirt, hem: LONG_HEM, legs: 's',
    colors: { h: '#5d4438', H: '#86685a', d: '#3f2d25', c: '#e59a8c', C: '#c27466', z: '#6c7f91', Z: '#55667a' },
  },
  grandma: {
    adult: true, head: ADULT_HEADS.bun, body: ADULT_BODIES['cardigan-skirt'], legs: 'q',
    colors: { h: '#b9b7aa', H: '#dddbd0', d: '#8e8c80', c: '#9986a2', C: '#776683', z: '#6b697b', Z: '#55536a', q: '#8a7f78' },
  },
  guard: {
    adult: true, head: ADULT_HEADS.short, body: ADULT_BODIES.vest, hats: ['cap'], legs: 'p',
    colors: {
      h: '#7c7770', H: '#a29d95', d: '#5b5650', c: '#5b6b7a', C: '#44525f', v: '#efc23a', V: '#f4f1e2',
      u: '#e9c74a', U: '#c19f2c', Y: '#f4f1e2', p: '#4f5a66', P: '#3c4550',
    },
  },
  shopkeeper: {
    adult: true, head: ADULT_HEADS.short, body: ADULT_BODIES.apron, legs: 'p',
    colors: {
      h: '#51453d', H: '#76695f', d: '#382f29', c: '#e1ddbe', C: '#bdb894', a: '#5f9a7e', A: '#477a62',
      p: '#7b6a5c', P: '#5f5146',
    },
  },
  staff: {
    adult: true, head: ADULT_HEADS.short, body: ADULT_BODIES.tie, hats: ['cap'], legs: 'p',
    colors: {
      h: '#47423d', H: '#6a645d', d: '#302c28', c: '#566a86', C: '#43546c', r: '#c4454b', W: '#e8c55c',
      u: '#4b617c', U: '#364860', Y: '#e8c55c', p: '#485b74', P: '#36465a',
    },
  },
  teacher: {
    adult: true, head: ADULT_HEADS.short, body: ADULT_BODIES.cardigan, legs: 'p',
    colors: { h: '#605044', H: '#857263', d: '#433730', c: '#b69e78', C: '#957f5c', p: '#687781', P: '#525f68' },
  },
  clerk: {
    adult: true, head: ADULT_HEADS.ponytail, body: ADULT_BODIES.stripe, legs: 'p',
    colors: {
      h: '#615046', H: '#86736a', d: '#443730', r: '#e9e6cd', c: '#70a28d', C: '#57836f', L: '#e9e6cd',
      n: '#f6f2e6', p: '#627580', P: '#4d5d66',
    },
  },
  friend: {
    adult: false, head: { front: HEADS.front.short, back: HEADS.back.short, side: HEADS.side.short },
    body: { front: BODIES.front.jacket, back: BODIES.back.jacket, side: BODIES.side.jacket },
    hats: ['kid-cap'], legs: 'p',
    colors: {
      h: '#4e3a2c', H: '#6f5646', d: '#33251c', c: '#e07b39', C: '#b85e25', L: '#eda06e',
      g: '#2f8f8a', G: '#23706c', u: '#2f8f8a', U: '#23706c', Y: '#f4f1e2', p: '#5b6f8a', P: '#46566d',
    },
  },
  classmate: {
    adult: false, head: { front: HEADS.front.tied, back: HEADS.back.tied, side: HEADS.side.tied },
    body: { front: BODIES.front.shirt, back: BODIES.back.shirt, side: BODIES.side.shirt },
    legs: 's',
    colors: {
      h: '#2e2c3f', H: '#4b4862', d: '#1e1c2b', r: '#f2a93b', R: '#c9832a', c: '#e889a6', C: '#c76b88',
      W: '#fbe6ee', p: '#3d4f7a', P: '#2f3d60',
    },
  },
};

/** 配置データに知らない名前があっても描けるように、特徴の少ない大人を使う。 */
const FALLBACK: Recipe = {
  adult: true, head: ADULT_HEADS.short, body: ADULT_BODIES.coat, legs: 'p',
  colors: { h: '#777466', H: '#9a978a', d: '#57554a', c: '#8d9885', C: '#6f7968', p: '#6b766b', P: '#545d54' },
};

/** ポーズも既存の sprite ID として扱い、マップや保存の形式は変えない。 */
export const SEATED_NPC_SPRITES: Readonly<Record<string, { base: string; reading: boolean }>> = {
  'grandma-reading-seated': { base: 'grandma', reading: true },
  'friend-seated': { base: 'friend', reading: false },
};

/** 図案を持つ NPC の ID（ねこと着席ポーズを含む）。 */
export const NPC_IDS: readonly string[] = [...Object.keys(RECIPES), 'cat', ...Object.keys(SEATED_NPC_SPRITES)];

function recipeFor(name: string): Recipe {
  const base = Object.hasOwn(SEATED_NPC_SPRITES, name) ? SEATED_NPC_SPRITES[name].base : name;
  return Object.hasOwn(RECIPES, base) ? RECIPES[base] : FALLBACK;
}

/** NPC の色と図案。テストで記号の定義漏れや主人公との重なりを確かめるために使う。 */
export function npcParts(name: string): { colors: Palette; grids: Grid[] } {
  if (name === 'cat') return { colors: CAT_COLORS, grids: [...Object.values(CAT), ...Object.values(CAT_TAIL)] };
  const recipe = recipeFor(name);
  const grids = [recipe.head, recipe.body, ...(recipe.hem ? [recipe.hem] : []), ...(recipe.hats ?? []).map(hat => HATS[hat])].flatMap(views => Object.values(views));
  return { colors: { ...BASE, ...recipe.colors, p: recipe.colors.p ?? recipe.colors.z, P: recipe.colors.P ?? recipe.colors.Z }, grids };
}

const CAT_COLORS: Palette = {
  o: '#4a2c1e', h: '#f0b77a', H: '#f8d6a8', d: '#c98545', L: '#fbf1df', p: '#f2a7a0', b: '#f6a9a3',
  n: '#e3867f', e: '#2b1a14', E: '#ffffff', m: '#7a4a3a',
};

/**
 * 脚。step は歩行の位相（-1・0・1）。上がった足は 1 ドット短く描く（主人公と同じ）。
 * length は足の行数（子ども 4・大人 5）。下から 3 行は靴下・靴・靴底。
 */
function legs(c: C2D, view: View, step: number, colors: Palette, token: string, length: number): void {
  const top = NPC_H - length;
  const leg = (x: number, lift: number) => {
    const rows = [...Array<string>(length - 3).fill(`o${token}${token}o`), 'oxxo', 'okkko', 'ooooo'];
    paint(c, lift > 0 ? rows.slice(1) : rows, colors, x, top);
  };
  if (view === 'side') {
    leg(step === 0 ? 7 : 6 - step, step === 0 ? 0 : 1);
    leg(step === 0 ? 9 : 9 + step, 0);
  } else {
    leg(5, step < 0 ? 1 : 0);
    leg(9, step > 0 ? 1 : 0);
  }
}

function drawCat(c: C2D, view: View, step: number): void {
  const paw = (x: number, lift: number) => paint(c, ['oLLo', 'oooo'], CAT_COLORS, x, 24 - lift);
  if (view === 'side') {
    paw(3 - step, step === 0 ? 0 : 1); paw(8 + step, 0);
    paint(c, CAT.side, CAT_COLORS, 1, 12);
    return;
  }
  if (view === 'front') paint(c, CAT_TAIL.front, CAT_COLORS, 12, 16);
  paw(5, step < 0 ? 1 : 0); paw(9, step > 0 ? 1 : 0);
  paint(c, CAT[view], CAT_COLORS, 3, 10);
  if (view === 'back') paint(c, CAT_TAIL.back, CAT_COLORS, 7, 20);
}

function drawSeated(c: C2D, recipe: Recipe, view: View, reading: boolean): void {
  const colors = { ...BASE, ...recipe.colors, p: recipe.colors.p ?? recipe.colors.z, P: recipe.colors.P ?? recipe.colors.Z };
  // 上体を下げ、伸びた脚ではなく膝を曲げた横向きのシルエットを使う。
  paint(c, recipe.head[view], colors, recipe.adult ? 3 : 1, 4);
  paint(c, recipe.body[view].slice(0, recipe.adult ? 6 : 5), colors, 0, recipe.adult ? 16 : 17);
  for (const hat of recipe.hats ?? []) paint(c, HATS[hat][view], colors, hat === 'cap' ? 2 : 1, 4);
  if (view === 'side') {
    paint(c, ['ooooooo', 'oppPPpo', 'ooooopo', '....oso', '....okko', '....oooo'], colors, 7, 20);
    if (reading) paint(c, ['..o...o.', '.owwowwo', 'owwwowwo', '.owwowwo', '..oSSo..'], colors, 10, 16);
    else paint(c, ['oSSSo', '.ooo.'], colors, 10, 19);
  } else {
    paint(c, ['oooooooooo', 'oppPPPPppo', 'ooppooppoo', '.oxx..xxo.', '.okkookko.', '.oooooooo.'], colors, 4, 20);
    if (reading) paint(c, ['.ooo.ooo.', 'owwwowwwo', '.owwowwo.', '..oSSSo..'], colors, 5, 17);
  }
}

export function drawNpc(c: C2D, name: string, facing: Facing, frame: 0 | 1 | 2): void {
  const view = viewOf(facing);
  const step = frame === 1 ? -1 : frame === 2 ? 1 : 0;
  if (facing === 'left') { c.translate(NPC_W, 0); c.scale(-1, 1); }
  if (name === 'cat') { drawCat(c, view, step); return; }
  const recipe = recipeFor(name);
  const seated = Object.hasOwn(SEATED_NPC_SPRITES, name) ? SEATED_NPC_SPRITES[name] : undefined;
  if (seated) { drawSeated(c, recipe, view, seated.reading); return; }
  const colors = { ...BASE, ...recipe.colors };
  const headX = recipe.adult ? 3 : 1;
  legs(c, view, step, colors, recipe.legs, recipe.adult ? 5 : 4);
  if (recipe.hem) paint(c, recipe.hem[view], colors, 0, 21);
  paint(c, recipe.body[view], colors, 0, recipe.adult ? 12 : 13);
  paint(c, recipe.head[view], colors, headX, 0);
  for (const hat of recipe.hats ?? []) {
    paint(c, HATS[hat][view], colors, hat === 'cap' ? 2 : 1, 0);
  }
}
