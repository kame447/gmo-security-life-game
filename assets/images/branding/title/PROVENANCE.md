# オープニング候補素材の出自記録

**案A・B・Cはいずれも採用未決定の候補です。これらの素材が追加されたことは、採用・本編接続・最終デザインの確定を意味しません。**

作成日: 2026-11-14（JST）。現在の6点すべて、OpenAI の組み込み `image_gen.imagegen` ツールで実際に画像生成した原本から書き出しました。具体的な生成モデルの識別子はツールの返却値に含まれず、確認できませんでした。特定モデル名を推測していません。外部の参照画像は入力していません。人物、文字、ロゴ、UI、既存作品・キャラクターの模倣を含めない指示で生成しました。

## 2026-11-14 のレビュー後の整理

当初は12点を書き出しましたが、2026-11-14 の利用者レビュー（[Issue #50](https://github.com/kame447/gmo-security-life-game/issues/50)）で案Aの羽の演出と案Bの横スクロールの演出が不採用になったため、使わなくなった次の6点を書き出し先・加工スクリプト・生成記録・検査結果から外しました。新しい画像は生成していません。

- `opening-a-wings.png`（案Aの羽）
- `opening-b-sky.png`・`opening-b-far.png`・`opening-b-near.png`・`opening-b-ground.png`・`opening-b-pit.png`（案Bの横スクロール用）

外した6点の書き出し画像と記録は、コミット 3d40d2a までの履歴に残っています。原本（`*-original.png`）は当初からコミットしておらず、作業用の手元にあるままです。

作り直した案Bは画像生成を使っていません。地面・小物・主人公は本編の描画コード（`game/src/render/`）で描き、落とし穴は `opening-a-pit.png` を縮小して使います。

## 利用条件・再配布について確認した事実と未確認事項

2026-11-14 に [OpenAI Terms of Use（2026-01-01 発効）](https://openai.com/policies/row-terms-of-use/) の Content / Ownership of content を確認しました。そこでは、適用法の許す範囲で、利用者と OpenAI の間では出力を利用者が所有し、OpenAI が持つ出力への権利を利用者へ譲渡すると定めています。同ページは、出力の独自性を保証せず、第三者の権利を尊重し、AI 出力を人が生成したと偽らないことも求めています。

[Sharing & publication policy](https://openai.com/policies/sharing-publication-policy/) も確認しました。対象となる共有では事前確認、責任主体の表示、AI 生成であることの明示を求めています。本ファイルは AI 生成と加工の事実を記録します。

ただし、この実行環境に適用される利用者の個別契約・契約プラン、組織の公開方針、公開時に付与する素材ライセンス、必要な最終クレジット表記は確認していません。上記の一般規約の確認だけで、あらゆる再配布の許諾や第三者権利の不存在が保証されたとは扱いません。独立した CC0・MIT 等の素材ライセンスは付与していません。原本・加工物とも、公開・再配布条件の最終確認は未完了です。第三者画像の流用は行わず、目視で既存の文字・人物・ブランドの混入は見当たりませんでしたが、第三者作品全体との類似性の網羅的調査は行っていません。

以下の各ファイルの「利用条件」には、この共通確認事項と未確認事項が等しく適用されます。

## 原本・加工・検査

原本は `assets/sources/images/branding/title/` の `*-original.png` に、ツールが出力した PNG をそのままコピーして保存しています。原本には加工前の余白や半透明の縁が残ります。原本は合計約13MB（整理した6点の分を含む）あるため、採用が決まるまでリポジトリにはコミットせず、作業用の手元にだけ置いています（スクリプトと記録2点はコミット済み）。ゲームに読み込むのは `assets/images/branding/title/` の書き出し画像です。

加工は Python 3.13 と Pillow 13.0.0 を仮想環境で使用しました。再現用スクリプトは [process-assets.py](../../../sources/images/branding/title/process-assets.py)、生成要求の機械可読記録は [generation-manifest.json](../../../sources/images/branding/title/generation-manifest.json)、寸法・色数・アルファ・左右端一致・SHA-256・原本サイズの検査結果は [validation-report.json](../../../sources/images/branding/title/validation-report.json) です。

共通処理は最近傍法による縮小、MEDIANCUT による減色（ディザなし）、アルファを閾値128で0/255に二値化、完全透過画素のRGBを0へ統一、PNG保存です。不透明画像は48色以内、透過画像は最大47色＋透過1色です。透過は実際のアルファチャンネルであり、市松模様の描き込みではありません。コードは生成画像の縮小・切り出し・並べ替え・継ぎ目調整に使用したもので、コード描画による代替素材はありません。

画像は原本と書き出しの両方をツール内で目視確認しました。指定寸法、人物・文字・ロゴ・UIが見当たらないこと、各視点、透過の挙動を確認しています。実際のアニメーション・ゲーム内合成は親側の実装で確認する範囲です。

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

現在の6点に未作成はありません。生成失敗や、生成画像の代わりに描いた画像ファイルはありません。案Cの口は約156×160pxで、約140pxという目安より少し大きいまま自然な輪郭を保持しています。正確なモデル識別子、個別契約の適用、公開用素材ライセンスは未確認です。採用案の選択・ゲーム内でのアニメーション調整・最終公開はこの素材作業には含みません。
