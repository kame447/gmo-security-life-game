# オープニング候補素材の出自記録

**案A・B・Cはいずれも採用未決定の候補です。これらの素材が追加されたことは、採用・本編接続・最終デザインの確定を意味しません。**

作成日: 2026-11-14（JST）。12点すべて、OpenAI の組み込み `image_gen.imagegen` ツールで実際に画像生成した原本から書き出しました。具体的な生成モデルの識別子はツールの返却値に含まれず、確認できませんでした。特定モデル名を推測していません。外部の参照画像は入力していません。人物、文字、ロゴ、UI、既存作品・キャラクターの模倣を含めない指示で生成しました。

## 利用条件・再配布について確認した事実と未確認事項

2026-11-14 に [OpenAI Terms of Use（2026-01-01 発効）](https://openai.com/policies/row-terms-of-use/) の Content / Ownership of content を確認しました。そこでは、適用法の許す範囲で、利用者と OpenAI の間では出力を利用者が所有し、OpenAI が持つ出力への権利を利用者へ譲渡すると定めています。同ページは、出力の独自性を保証せず、第三者の権利を尊重し、AI 出力を人が生成したと偽らないことも求めています。

[Sharing & publication policy](https://openai.com/policies/sharing-publication-policy/) も確認しました。対象となる共有では事前確認、責任主体の表示、AI 生成であることの明示を求めています。本ファイルは AI 生成と加工の事実を記録します。

ただし、この実行環境に適用される利用者の個別契約・契約プラン、組織の公開方針、公開時に付与する素材ライセンス、必要な最終クレジット表記は確認していません。上記の一般規約の確認だけで、あらゆる再配布の許諾や第三者権利の不存在が保証されたとは扱いません。独立した CC0・MIT 等の素材ライセンスは付与していません。原本・加工物とも、公開・再配布条件の最終確認は未完了です。第三者画像の流用は行わず、目視で既存の文字・人物・ブランドの混入は見当たりませんでしたが、第三者作品全体との類似性の網羅的調査は行っていません。

以下の各ファイルの「利用条件」には、この共通確認事項と未確認事項が等しく適用されます。

## 原本・加工・検査

原本は `assets/sources/images/branding/title/` の `*-original.png` に、ツールが出力した PNG をそのままコピーして保存しています。原本には加工前の余白や半透明の縁が残ります。原本12点は合計約13MBあるため、採用が決まるまでリポジトリにはコミットせず、作業用の手元にだけ置いています（スクリプトと記録2点はコミット済み）。ゲームに読み込むのは `assets/images/branding/title/` の書き出し画像です。

加工は Python 3.13 と Pillow 13.0.0 を仮想環境で使用しました。再現用スクリプトは [process-assets.py](../../../sources/images/branding/title/process-assets.py)、生成要求の機械可読記録は [generation-manifest.json](../../../sources/images/branding/title/generation-manifest.json)、寸法・色数・アルファ・左右端一致・SHA-256・原本サイズの検査結果は [validation-report.json](../../../sources/images/branding/title/validation-report.json) です。

共通処理は最近傍法による縮小、MEDIANCUT による減色（ディザなし）、アルファを閾値128で0/255に二値化、完全透過画素のRGBを0へ統一、PNG保存です。不透明画像は48色以内、透過画像は最大47色＋透過1色です。透過は実際のアルファチャンネルであり、市松模様の描き込みではありません。コードは生成画像の縮小・切り出し・並べ替え・継ぎ目調整に使用したもので、コード描画による代替素材はありません。

画像は原本と書き出しの両方をツール内で目視確認しました。指定寸法、人物・文字・ロゴ・UIが見当たらないこと、各視点、透過の挙動を確認しています。案Bの4タイルは左右端RGBAが完全一致し、遠景・近景の下端アルファは全幅255です。実際のアニメーション・ゲーム内合成は親側の実装で確認する範囲です。

## opening-a-street.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-a-street-original.png`。
- 加工手順: 原本全体を480×270へ最近傍縮小し減色。中央約200×120は物や道路標示のないアスファルトの領域。原本の高解像度の街の細部は縮小しています。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Create an original 2D pixel-art game background, aspect ratio 16:9, designed for nearest-neighbor reduction to 480x270. Near-vertical overhead view of a quiet Japanese residential street intersection in a semi-urban town. Wide grey asphalt streets cross at the center. The central rectangle, about 200x120 pixels at the target size, must be completely clear flat grey asphalt with no road markings, objects, wires, shadows or cracks; this is space for an animated title and pit. Around the outer edges: tiled roofs of modest houses, small concrete garden walls, shrubs, utility poles and zebra crossings placed away from the central rectangle. Sunny gentle everyday atmosphere. Restrained warm cream, terracotta, sage green, slate grey palette, 32-48 colors, crisp chunky square pixels, no antialiasing or painterly gradients. Camera almost straight down, not isometric, not side view. No people, no animals, no cars, no letters, no numbers, no text, no logos, no watermarks, no UI, no recognizable brands or existing fictional characters. Full bleed, no border.
```

## opening-a-pit.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-a-pit-original.png`。
- 加工手順: アルファ>=128の外接矩形を切り出し、縦横比を維持して160×112の透明キャンバスへ配置（周囲3px以上）。穴の内部は不透明な暗色、外側のみ透過。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Original 2D pixel-art game sprite of a deep pit in asphalt seen from directly above, designed for 160x112 pixels. One irregular oval hole, width about 150 and height about 96 at target resolution, centered with transparent margins. Broken chunky grey asphalt rim, a few small loose stones close to rim, warm brown soil immediately inside, dark navy-black deep interior. Near-overhead view compatible with a top-down residential street. Clear readable silhouette, friendly adventure-game mood, 32-48 muted warm colors, crisp square pixels, no antialiasing. Genuine transparent background outside the hole and its broken rim; the dark interior is opaque. Do not depict surrounding street or rectangular floor. No text, letters, numbers, logos, watermarks, UI, people or characters.
```

## opening-a-wings.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-a-wings-original.png`。
- 加工手順: 原本を左右2分割し、それぞれアルファ外接矩形を抽出。共通縮尺で最大60×28以内に縮小し、64×32の各コマの中央・下端y=30に配置。128×32のシート。左=水平に開く、右=上へ羽ばたく。2コマとも左右一対の羽を含みます。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Original 2D pixel-art sprite sheet on a truly transparent background. Exactly TWO animation frames arranged horizontally, each 64x32 logical pixels, total 128x32 logical aspect 4:1. In EACH frame, show one complete symmetric pair of small white feathered wings with a small empty transparent gap at center for attaching a title. Frame 1 on left: wings extended outward horizontally. Frame 2 on right: the same pair raised upwards in a flap. Keep identical scale and centered attachment point within each cell. Pearl-white feathers, pale blue-grey shading, tiny dark slate pixel outlines, simple chunky square pixels readable at 64x32, 16-32 colors, no antialiasing. No body, people, birds, halo, text, frame lines, labels, letters, numbers, UI, logos, watermarks. Transparent all around both pairs.
```

## opening-b-sky.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-b-sky-original.png`。
- 加工手順: 全体を480×270へ最近傍縮小。左右各24pxの帯で対応画素が共通色へ収束するよう調整し、減色。左右端RGBAが一致。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Original crisp 2D pixel-art sky background for a side-scrolling everyday-life game. Wide 16:9 full-bleed canvas, intended logical size 480x270. Only clear pale blue morning-to-noon sky and a few soft white pixel clouds, no ground, no horizon, no sun disk. Bright calm atmosphere, subtle sky color bands instead of smooth gradients, chunky square pixel edges, limited pastel palette, no antialiasing. Horizontally seamless tile: sky color must be identical at left and right at each height, leave both outer 15 percent edge bands cloud-free. Clouds small and well-spaced. No text, logos, watermarks, UI, people or objects.
```

## opening-b-far.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-b-far-original.png`。
- 加工手順: 原本下端から高さ339pxの帯を切り出し、960×150へ最近傍縮小。遠景を小さく保つため上部に透明余白があります。左右各24pxを継ぎ目調整。下端が不透明な建物基準線、左右端RGBAが一致。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Original 2D pixel-art parallax background strip, a very wide thin panorama intended to be 960x150 logical pixels. Pure side-on orthographic view of distant low and medium-rise Japanese semi-urban buildings against low layered mountain silhouettes, quiet residential town, no skyscrapers. Simplified muted blue-grey and sage silhouettes, a few pale window blocks, low detail suitable for far distance, crisp square pixels with no antialiasing. All buildings and mountains anchored to a single straight horizontal baseline at the very bottom; no visible ground underneath. Top and all empty space truly transparent, no sky fill, no checkerboard. Horizontally looping composition: both far left and far right edges end with the same low silhouette height and mountain tone, no conspicuous landmark at either edge. Broad low building skyline throughout, mountains behind. No people, letters, numbers, signs, text, logos, watermarks or UI.
```

## opening-b-near.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-b-near-original.png`。
- 加工手順: アルファ>=128の外接矩形で透明余白を切り、960×170へ最近傍縮小。指定寸法へ合わせるため元の帯を縦方向に少し圧縮。左右各24pxを継ぎ目調整。下端が地面基準線、左右端RGBAが一致。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Original 2D pixel-art parallax game strip intended as a 960x170 logical-pixel very wide panorama. Strict SIDE VIEW, orthographic elevation, no isometric perspective, no overhead view. A continuous Japanese semi-urban street frontage: modest two-story tiled-roof houses, a tiny neighborhood shop with plain blank awning and absolutely no sign lettering, utility poles, small street trees, low garden walls. Warm cream walls, terracotta and slate roofs, sage leaves, restrained sunny 32-48-color everyday palette. Crisp chunky pixels, no antialiasing. One straight ground baseline along the very bottom of all buildings, no road or pavement below it; transparent sky above roofs and transparent gaps. Truly transparent background, not checkerboard. Horizontal looping strip: left and right edges meet at matching low garden wall and shrub height, do not cut a large building at edge. All objects seen from directly sideways. No people, animals, cars, text, letters, numbers, logos, brands, watermarks, UI or border.
```

## opening-b-ground.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-b-ground-original.png`。
- 加工手順: 原本上部に意図しない黒い余白が生成されたため除去。原本y=256..479の歩道を96×24、y=480..554の縁石を96×6、y=555..1023の道路を96×34へ最近傍縮小して縦に結合。合計96×64。左右各8pxを継ぎ目調整し、左右端RGBAが一致。上端から歩道が始まります。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Original 2D pixel-art ground tile for a side-scrolling game, intended logical resolution 96x64, aspect 3:2. A straight perfectly horizontal strip: top 24 pixels show a light warm grey rectangular sidewalk surface with simple paving joints, next 6 pixels a slightly darker vertical curb edge, bottom 34 pixels dark slate asphalt road with a few restrained tiny texture pixels. Strict game-side-view ground band, not perspective; no diagonal lines. Fully opaque edge-to-edge rectangle. Seamless horizontally: paving rhythm repeats and left/right edge pixels align at every height. Crisp square pixel art, calm sunny everyday neighborhood palette, 16-32 colors, no antialiasing. No buildings, plants, people, vehicles, road markings, text, labels, logos, watermarks or UI.
```

## opening-b-pit.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-b-pit-original.png`。
- 加工手順: アルファ>=128の外接矩形を切り出し、縦横比を保って64×48の透明キャンバスに配置（周囲2px以上）。横視点の断面で、内部は不透明な暗色です。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Original 2D pixel-art sprite for a side-scrolling game: a small pit cut into a flat road, shown strictly FROM THE SIDE as a cross-section, logical 64x48 pixels, aspect 4:3. Broken dark grey asphalt lips at upper left and upper right form a gap, with jagged warm brown soil walls descending into a deep nearly black navy cavity, a few small stones at the rim. The top opening is a shallow narrow ellipse seen nearly edge-on, not a wide top-down bowl. Compact readable silhouette, centered with transparent padding. True alpha transparent background outside the pit; inside cavity opaque dark. Muted warm 24-40 colors, crisp chunky square pixel edges, no antialiasing, no shadows outside silhouette. No people, objects, text, numbers, letters, logos, watermarks, UI.
```

## opening-c-pitwall.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-c-pitwall-original.png`。
- 加工手順: 原本全体を480×480へ最近傍縮小し減色。中央口の生成アルファを二値化して保持。透明領域の外接矩形はx=157..312、y=160..319（約156×160）。中心(240,240)は透明、四隅は不透明。約140px指定に対し自然な不整形の口はやや大きめです。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Original crisp 2D pixel-art game background, square composition intended 480x480 logical pixels. Camera at the very bottom of a deep circular earthen pit looking straight UP vertically toward the sky opening. Rough earth and stone walls fill all four outer canvas edges and corners and converge radially toward a circular opening exactly in the center. The central opening has diameter approximately 140 pixels of the 480 square (29 percent of canvas width). THE CENTRAL OPENING IS TRUE TRANSPARENT ALPHA, with no painted sky, no dark fill and no checkerboard. Everything outside the central opening is opaque earthen wall all the way to the square canvas edges; do not isolate a donut on transparent outside. From dark brown foreground at outer edges to lighter ochre-brown walls toward center, angular rocks, occasional small roots, broken slate asphalt and a few green grass tufts around the distant circular mouth. Strong radial upward perspective; clearly looking out of a pit, not down into a hole. Friendly adventure-game pixel style, restrained 32-48 colors, square pixels, no antialiasing. No people, animals, text, logos, watermarks, UI.
```

## opening-c-sky.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-c-sky-original.png`。
- 加工手順: 原本全体を480×270へ最近傍縮小し減色。不透明な空単体。中央にタイトルや穴の口から見える空として使える余白。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Original 2D pixel-art blue-sky background for a game cinematic looking upward through a hole. Wide 16:9 canvas intended logical size 480x270. Calm luminous daytime blue sky with two or three gently shaped white pixel clouds near upper corners, broad open clear sky through center. No ground or horizon, no sun disk. Restrained pale blue and white palette, deliberately blocky pixel cloud silhouettes and minimal stepped shading, no smooth gradients, no antialiasing, full bleed opaque background. No people, objects, buildings, letters, text, numbers, logos, watermarks, UI or border.
```

## opening-c-town.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-c-town-original.png`。
- 加工手順: 原本全体を480×270へ最近傍縮小し減色。上側約3分の1が空、住宅・低中層ビル・線路・山並みが下側にあります。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Original 2D pixel-art panoramic establishing view of a friendly Japanese semi-urban town, wide 16:9 composition intended logical size 480x270. Camera slightly elevated looking across town, not top-down map, not isometric. Lower two thirds contain lived-in tiled-roof houses, a few low and medium-rise apartment buildings, small trees, a modest station area and railway tracks continuing horizontally out of frame, a quiet neighborhood shopping street with blank facades. Distant low green mountains on the horizon. The TOP THIRD is broad calm blue sky with just small restrained clouds at far sides and a clear central area for a title that will be added later. Warm cream walls, terracotta and slate roofs, muted sage green vegetation, pastel blue sky, gentle morning daylight. Deliberate crisp chunky square pixels, 32-48 color feel, no antialiasing, no photographic or painterly texture. No people, animals, cars, readable signs, text, letters, numbers, logos, brands, watermarks, UI or border.
```

## opening-dust.png

- 生成日: 2026-11-14（JST）。
- 生成手段: `image_gen.imagegen`、具体的なモデル名は未公開・未確認。
- 原本: `assets/sources/images/branding/title/opening-dust-original.png`。
- 加工手順: 原本を横4分割し、各コマのアルファ外接矩形を切り出し。共通縮尺で各コマ最大20×20以内へ最近傍縮小。24×24の各透明セルの中央・下端y=22に配置して96×24に結合。左から小さな煙、膨張、拡散、消散。 最後に上記の共通減色・アルファ処理・PNG保存を実施。
- 利用条件・再配布: 共通節の規約上の事実を確認。個別契約・素材ライセンス・再配布条件の最終確認は未完了。

プロンプト全文:

```text
Use case: stylized-concept. Original 2D pixel-art animation sprite sheet, exactly FOUR separate frames in one horizontal row, each square 24x24 logical pixels, total logical 96x24. Four stages of one small soft earthy dust puff after an impact: frame 1 tiny low compact puff, frame 2 growing round lobe cluster, frame 3 broader separated billows, frame 4 small dispersed fading particles. Consistent warm sandy beige and tan palette, pale cream highlights, soft friendly mood, crisp square pixels, 16-24 colors, no antialiasing. Each frame has transparent margins and is centered horizontally with bottom aligned; clear gaps between cells, no overlap. Genuine transparent alpha background, no checkerboard drawn into art. No ground, impact object, people, text, labels, numbers, letters, outlines around frames, UI, logos or watermarks.
```

## 未作成・未解決

要求された12点に未作成はありません。生成失敗や代替のコード描画はありません。案Cの口は約156×160pxで、約140pxという目安より少し大きいまま自然な輪郭を保持しています。正確なモデル識別子、個別契約の適用、公開用素材ライセンスは未確認です。採用案の選択・ゲーム内でのアニメーション調整・最終公開はこの素材作業には含みません。
