# 0009: 生成マップの編集結果を永続化する方式の検討

記録日：2026-11-13

状態：提案／要検証。以下の方式はいずれも未採用です。

関連：[Issue #24](https://github.com/kame447/gmo-security-life-game/issues/24)、[全店舗の内部 #33](https://github.com/kame447/gmo-security-life-game/issues/33)、[編集基盤 0007](0007-editor-data-boundary.md)、[編集仕様](../features/editor.md)。

## 現在の境界

現在の町・屋内マップと既存NPCはTypeScriptで生成します。#24はそのデータを読み取り専用のMapSceneとして表示し、編集・差分適用は独立した `game/data/editor-prototype.json` で確認します。生成元のTS、既存NPC、通常ゲームの読込口は変更しません。

表示用変換で匿名の配置物に付ける補助IDは、元配列の位置に依存します。見た目の選択には使えても、手修正・再生成後も同じ対象を表す永続IDとしては使えません。実マップへの移行では、マップ担当が安定したIDと所有範囲を確定する必要があります。

## 永続化方式の候補

| 提案 | 利点 | 検証が必要な点 |
| --- | --- | --- |
| 生成結果に安定ID付きJSONの上書き差分を重ねる | 既存生成コードと編集結果を分離し、小さく移行できる | 生成元の変更との競合、対象IDの欠落、年代差分との適用順序 |
| 配置・地面・参照を編集用JSONへ抽出する | GUI・検証・ランタイムが同じデータを読める | 既存の経路・衝突・ポータル・NPC・描画順を保つ移行、生成時の規則の所有者 |
| 専用JSONから管理対象TSを生成する | 型付きの生成データを既存コードへ渡せる | 手書き領域との明確な分離、出力先のmanifestと再現性、元データとの二重管理の回避 |

どの案でも、任意コードや手書きTSの部分置換を編集差分へ含めません。変更前のデータとの比較、適用前確認、失敗時の元データ保持、再読込一致を維持します。採用にはマップ／NPC担当との合意と、既存の基本経路・衝突・出入口・保存・年代差分の回帰確認が必要です。

## 店舗内装への接続

#33の店舗内部は、施設・屋内エリア・棚／カウンターの足元・通路・衝突・往復出入口・店員参照を同じ契約へ載せる想定です。店舗の正式ID、内装、店員、商品カタログへの接続形式や年代別の開閉条件は、担当間で確定します。この記録は特定の店舗レジストリや内装配置を採用するものではありません。

今回実装するのはサンプルで契約を確認するツールと、実マップの参照表示までです。既存マップへの適用、店舗の増設、NPCの再配置、保存形式の変更は後続の設計・制作です。

## 2026-11-13: 読み取り評価の結果（提案／要検証、方式は未採用）

評価の起点は `feat/map-editor` a3d5894。`game/scripts/map-persistence-check.mjs` は実マップを読み、棚卸し・往復測定・適用前検査を行う。実マップのTS、通常ゲームの読込口、サンプル適用コマンドは変更しない。3案の採用・推奨は行わない。

### IDと衝突の棚卸し

以下は既定 childhood ワールドの測定値。`inventory --markdown` で再生成できる。各欄は **元データのIDあり / 配列添字または座標からの補助アドレス**。装飾は layer=decal の配置物であり、配置物と重複して数える。衝突マスクのセルも配置物との合計にはしない。

| エリア | 施設 | 配置物 | 装飾（部分集合） | 出入口 | 衝突する配置物 | 衝突する調査対象 | 地形の衝突セル | 実行時の衝突セル |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| home-family-interior | 0/0 | 13/0 | 2/0 | 1/0 | 11/0 | 3/0 | 0/54 | 0/82 |
| school-classroom-interior | 0/0 | 21/0 | 3/0 | 1/0 | 18/0 | 2/0 | 0/54 | 0/77 |
| shop-konbini-interior | 0/0 | 8/0 | 0/0 | 1/0 | 8/0 | 3/0 | 0/42 | 0/60 |
| town-main | 11/0 | 270/0 | 4/0 | 3/0 | 266/0 | 12/0 | 0/1531 | 0/3756 |

施設11・配置物312・出入口6・調査対象20に元IDがあり、重複は0。現在の実マップでは匿名配置物と表示用reference-* IDは0件だった。ただし、元IDがあることと、座標・生成規則の変更後も安定した永続IDであることは区別する。

配置物312件のIDはすべて、現行 `town.ts` / `interiors.ts` の `種別-x-y` を含む生成式に一致する。配置生成コードで座標を変えるとIDも変わり得るため、位置から独立した永続IDとは扱えない。施設や出入口・調査対象の名前付きIDも、今後の所有者・変更手続きは未合意。評価では元IDと全データの指紋を併用し、匿名配置物の配列添字IDは編集対象の解決に使わない。地形1681セルと実行時衝突3975セルは独立IDを持たず、エリア幅と座標から導くアドレスである。

### 往復の忠実度

既存の `referenceScene(world)` に、測定用の文書ID・元start・抽出したsprite/eventKey参照一覧を明示的に加えた。raw再構成は厳密backend検証とは分け、測定にだけ使う。

| 対象 | 測定結果 |
| --- | --- |
| 全4エリアの地形・配置物の属性・調査対象・出入口 | 保持。地形はnumber[]からUint8Arrayへ戻る |
| 全4エリアの衝突マスク・portalAt・interactionAt | raw再構成で一致 |
| 施設参照・出入口の到着位置と向き | 保持。既存 shop-konbini / konbini-enter / shop-konbini-interior の参照も一致 |
| 地区情報 | town-main の4地区を失う。MapScene/EditorAreaにdistrictsがない |
| 開始地点・参照一覧・文書ID | MapScene単体にはない。今回の測定では元World等から外部補完 |
| 年代・生成規則 | EditorWorldは文書IDとchildhoodを置くため、元variantのID・メッセージ・差分規則を復元できない |
| 反復順序 | エリアMapと施設MapはID順になる。backendのID順正規化では、配置物4エリア・調査対象4エリア・町の出入口の計9配列の順が変わる |
| 生成元の関数・無効化前の基底データ | 表示用の生成結果から復元できない |

この一致はrawデータの測定であり、ゲームへの永続適用・描画順・経路の移行が受理されたことではない。objectIdやreturnPortalIdは推測して補わない。source配列順を保持するか別の描画順を持たせるかも未決定。

厳密backendへ渡すと、数字文字列のstyle値 `0`〜`4` がkebab-case検査に61件拒否される（各8・12・18・15・8件）。検証はshape段階で停止するため、その文書に対する後段の重複・衝突・到達性は未判定。実データやbackendを緩めて通す修正は行っていない。

### 3案の比較へ渡す根拠

| 未採用の案 | 今回確認できたこと | なお検証・合意が必要な点 |
| --- | --- | --- |
| 上書き差分 | 指紋・ID・独立した編集範囲で古い提案や別対象を拒否できる | 座標由来IDの扱い、生成規則/年代変更時の再解決、元の順序と補助情報の保持 |
| JSON抽出 | 既存の幾何・属性・衝突索引をraw測定では往復できた | districts/start/variant/順序の表現、style等の検証契約、生成前の規則とデータの所有 |
| 管理対象TS生成 | 同じ事前検査を使える | JSONだけでは元の関数を戻せないため、専用の出力manifestと手書き領域の分離、再生成の再現性が必要。TS出力は未試作 |

### 共通の適用前検査

`editor-persistence/common.ts` と `dry-run.ts` はマップ/NPCで共有する評価用契約。requestは `schemaVersion:1`・`sourceFingerprint`・`operations` を持つ。信頼するscopeは別入力で、`areaIds` と `targets:[{table,id}]` を明示する。差分の中へscope・ファイルパス・コードを入れて編集権限を増やすことはできない。

指紋は生成済みの全AreaDef（districtsを含みgroundのみnumber[]化）・施設・start・variantのsnapshotを対象にする。areas/facilitiesはID順、その他の配列順は保持。backendのcanonicalJSON（キー順・2space・末尾LF）のUTF-8をSHA-256へ渡す。手書きTSのバイト指紋ではなく、そのvariantの生成済み意味データの指紋である。Mapの挿入順だけの違いは含めない。

既定Worldの指紋: `sha256:5a360628eac3b9595bad09b4dbad5a4aaa2212c82a7a5fea37cf2c4032ee5e1c`。

検査は、指紋一致・元IDの一意解決（補助IDは拒否）・backendの厳密検証・選択範囲を確認する。map域はNPC以外、npc域は変更前後ともNPCの調査対象に限定。範囲検査はID付きレコードの追加/削除/フィールド更新を対象とし、ポータルでは接続先のエリアもscopeに必要。元の描画配列順と補助情報の復元は上の比較で別に扱い、この通過だけで実マップ適用の安全性全体を宣言しない。

結果は `schemaVersion:1`・`evaluationOnly:true`・domain・status（passed/rejected）、現/要求指紋、checks（fingerprint/ids/backend/scope）、issues（stage/path/code/message）、変更対象の一覧。checksのskippedは、他の拒否等で候補全体の検証まで進めなかったことを示す。すべて通った場合だけ候補のEditorDocumentを返す。元のWorld・文書・要求は変更しない。

### 使い方と一時出力

Node.js 24と既存の依存を使い、game/で実行する。追加パッケージとブラウザは不要。

```sh
node scripts/map-persistence-check.mjs inventory
node scripts/map-persistence-check.mjs inventory --markdown
node scripts/map-persistence-check.mjs roundtrip
node scripts/map-persistence-check.mjs dry-run /tmp/request.json /tmp/scope.json
node scripts/map-persistence-check.mjs dry-run /tmp/request.json /tmp/scope.json --write-temp
```

現状を検査するrequestの例は、inventoryの指紋を使った `{ "schemaVersion": 1, "sourceFingerprint": "sha256:...", "operations": [] }`。scopeは独立した `{ "areaIds": ["town-main"], "targets": [] }`。実際の提案では型EditOperationに従うbefore/afterと、別scopeの対象IDを指定する。現在の実マップでは上の61件によってrejected・終了コード2となる。合成Worldでは正常な移動・追加/削除・再読込一致もテストするが、それを実マップの受理成功とは扱わない。

通常は標準出力のみ。`--write-temp` はOSの `/tmp` 実体下へ新規の `slg-persistence-evaluation-*` を作り、report.json・baseline.json、成功時だけcandidate.jsonを書く。TMPDIRや提案データから出力先を指定せず、任意の出力パス・applyコマンドを持たない。legacy Worldの読込には既存ViteのSSR loaderを使い、キャッシュも一時ディレクトリ内に作って終了時に除去する。サーバーポートは開かない。

`npm test` はVitestと、既存CLI13件・新しいCLI/一時出力7件を実行する。CLI検証は元ファイルとサンプルJSONのバイト不変、指紋の再現性、任意出力の拒否、一時出力だけであることも確認する。合成Worldで通った候補を一時JSONへ出して再読込する確認も含む。いずれも既存マップへ適用する入口には接続していない。
