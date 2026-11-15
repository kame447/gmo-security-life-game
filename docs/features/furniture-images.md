# PNG家具素材とCanvas描画の併用

関連：親Issue #7、内装改善Issue #15、Draft PR #60。

## 状態と範囲

Phase 1は素材カタログ、画像読み込み、安全なCanvas置換と単体テスト。
ゲームの `sprites.ts` には未接続で、PNGを配置するだけでは実ゲームの表示は変わらない。
学校18×12・コンビニ14×10、家具・NPC・出入口の配置、会話、eventKey、衝突、保存は変更しない。
この文書の画像寸法は採用した初期の組み込み契約であり、マップ全体の最終仕様を決めるものではない。

## 素材の保存先と契約

実行用PNGはリポジトリ直下の `assets/images/objects/props/interiors/` に一度だけ保存する。
編集元は `assets/sources/images/objects/props/interiors/` に分離する。
素材ごとに作者・生成ツールとプロンプト・加工・出典・利用条件・再配布可否・クレジットを記録する。
画像の実データは利用者から後日提供する。Phase 1で画像や仮のゲーム素材は追加しない。

| 相対ファイル名 | PNG寸法（px） |
| --- | --- |
| school/student-desk.png | 16×16 |
| school/teacher-desk.png | 32×16 |
| school/classroom-shelf.png | 32×16 |
| school/blackboard.png | 128×16 |
| school/window.png | 32×16 |
| konbini/product-shelf.png | 32×16 |
| konbini/cooler.png | 32×16 |
| konbini/magazine-rack.png | 32×16 |
| konbini/counter.png | 48×16 |

16pxタイル基準・家具ごとに独立したPNG・透過対応。透過余白を含めて表の寸法にする。
原寸で左上に描画し、画像の自動拡縮・切り抜き・オフセット・はみ出しは初期契約に含めない。
透明部分は通行可能領域を意味しない。当たり判定は既存のObjectDefのまま扱う。

## モジュールと読み込み

- `catalog.ts`：素材ID・相対ファイル名・寸法、既存家具ID29件との対応。
  他の室内にも素材と対応を追加できる。IDが一致しても占有寸法が変わっていれば割り当てない。
- `loader.ts`：URL単位で進行中・成功・失敗の読み込みを共有する。
  `decodePng()`はHTTP成功、PNG署名、ブラウザのデコード、実寸取得を行うDOMアダプター。
  寸法は共有画像を取得した後、各素材の要求ごとに検証する。
  `FurnitureImageLoader`には独自のImageDecoderを注入でき、DOMなしでテストできる。
- `paint.ts`：検証済み画像を補間なしで別Canvasに描き、ピクセル取得まで成功してから既存Canvasへ転送する。
  `putImageData()`で透明部分も置換するため、旧家具が下から透けない。
  既存Canvasの参照・寸法を維持し、変換・クリップ・合成設定に影響されず置換する。
  書き込み前に旧ピクセルを退避し、転送失敗時は復元する。

未提供は `unavailable/missing`、通信・署名・デコード失敗は `unavailable/load`、寸法不一致は
`unavailable/dimensions` として返す。これらの結果では既存Canvasを変更しない。
失敗URLも共有するのでフレームごとの再試行は起きない。再試行は新しいLoader、通常はページ再読み込みで行う。
デコード中も既存描画を表示できる。コンテキスト喪失等でCanvas自体が利用不能な場合の復旧は対象外。

## Viteのルート外アセット

Viteのrootは起動ディレクトリの `game/`、publicDirは既定の `game/public/`（現在未作成）、baseは `./`。
publicDirの追加・画像の複製・設定変更は行わない。

`catalog.ts` からリポジトリ直下へ4階層戻るリテラル相対glob
`../../../../assets/images/objects/props/interiors/**/*.png` を使い、
`query: '?url&no-inline', import: 'default', eager: true` でURLを取得する。
固定ファイルのimportと異なり、対象フォルダ／PNG未提供時は空の対応表になる。
globは小文字 `.png` のみが対象で、絶対パス文字列や実行時の任意URLを組み立てない。

開発時はViteが解決したimportを通じてルート外ファイルを配信する。既定のfs.strictを無効化しない。
ビルド時は参照されたPNGが成果物のassetsへ出力され、URLはbaseに従って解決される。
no-inlineで小さいPNGもURLアセットにする。元の素材はassets側の一箇所のみ管理する。
PNG追加後は開発サーバーを再起動／ページ再読み込みし、公開時は再ビルドする。

## Phase 2の接続契約

PR #57の担当者と調整し、scopeを更新してから `sprites.ts` に接続する。

1. `furnitureAsset(object)` で対象素材を選ぶ。
2. スプライトキャッシュキーに素材IDを含め、未登録家具のキーと区別する。
3. 従来の `furnishing()` 等でCanvasを描画して、先にキャッシュへ登録する。
4. 共有Loaderの `load(asset, FURNITURE_URLS)` を開始する。
5. readyなら `paintFurnitureImage(sprite.canvas, result)` で同じCanvasを更新する。
6. 非同期処理の予期しない失敗も捕捉し、フォールバックを維持する。

描画順・layer・offset・衝突は維持する。同寸法なので描画器の索引再構築は不要。
PNG未提供・ロード失敗時のゲーム表示、キャッシュの素材間分離、読み込み完了後の画面更新、
学校・コンビニ往復と会話、実画像での透過と前後関係はPhase 2のブラウザ確認対象。

## Phase 1の検証

`game/` で `npm run build`、`npm test`。
単体テストは既存家具との対応、ロード共有、欠落・通信・署名・デコード・寸法エラー、
透過置換、ステージング失敗時の非変更、転送失敗後の旧ピクセル復元を確認する。
Viteのルート外配信は、一時的なテスト素材による開発配信・ビルド出力の検証で確認する。
