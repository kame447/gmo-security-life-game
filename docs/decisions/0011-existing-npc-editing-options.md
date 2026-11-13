# 0011: 既存 NPC の編集・永続化の検討

記録日：2026-11-13

状態：提案／要検証。いずれの永続化方式も未採用。

関連：[Issue #25](https://github.com/kame447/gmo-security-life-game/issues/25)、[編集基盤 0007](0007-editor-data-boundary.md)、[マップの選択肢 0009](0009-map-editor-persistence-options.md)、[編集仕様](../features/editor.md)。

## 評価の範囲

既定 childhood の生成済み World を読み取り、NPC にあたる `kind: npc` の調査対象を測定する。エディタの参照表示を経由した未検証の raw 往復と、実際の編集 backend の厳密な受理は分ける。NPC・台詞・実マップやゲーム読込口を変更せず、人物やシナリオを新たに採用するものではない。

### 現在の棚卸し

`node scripts/npc-persistence-check.mjs inventory --markdown` で次の表に使った値を取得できる。lines は既定会話の行数であり、イベントそのものの実装数ではない。衝突欄の lookup は、該当セルの実行時 `interactionAt` で解決される ID。

| エリア | NPC ID | スプライト | 向き | 座標 | lines | イベントキー | 衝突 / lookup |
| --- | --- | --- | --- | --- | --- | --- | --- |
| town-main | neighbor-grandma | grandma | left | 40,33 | 1 | neighborhood.grandma | true / neighbor-grandma |
| town-main | neighborhood-cat | cat | down | 42,36 | 1 | neighborhood.cat | true / neighborhood-cat |
| town-main | school-guard | guard | left | 104,36 | 1 | school.guard | true / school-guard |
| town-main | park-friend | friend | left | 100,61 | 1 | park.friend | true / park-friend |
| town-main | candy-shopkeeper | shopkeeper | down | 48,53 | 1 | shopping.candy | true / candy-shopkeeper |
| town-main | station-staff | staff | left | 32,65 | 1 | station.staff | true / station-staff |
| home-family-interior | home-mother | mother | left | 13,4 | 1 | home.mother | true / home-mother |
| school-classroom-interior | school-teacher | teacher | down | 10,2 | 1 | school.teacher | true / school-teacher |
| school-classroom-interior | school-classmate | classmate | left | 12,6 | 1 | school.classmate | true / school-classmate |
| shop-konbini-interior | konbini-clerk | clerk | left | 10,3 | 1 | shopping.konbini.clerk | true / konbini-clerk |

合計10件（町6・自宅1・教室2・コンビニ1）。10件とも定義中に明示した小文字 kebab-case の ID があり、生成済み文書全体で重複は0。IDは座標から自動生成されていないが、将来の改名・所有・移行ルールが合意済みという意味ではない。幅・高さは省略され、実行時は全件 1×1。地形の壁や他の配置物・調査対象・出入口との重複は現状0で、全件の衝突・lookup は上表のとおり。全10種のスプライトは現在の描画候補にも含まれる。JSON棚卸しには名前・会話文字列と重複の詳細も含む。

### 文書化と往復

参照表示 `referenceScene(world)` に評価用の文書ID・start・既存の sprite / eventKey カタログを補い、コピーを `assembleEditorWorld` で再構成した。10件の NPC 属性、会話、位置、衝突および該当セルの `interactionAt` はこの **未検証 raw 往復**で一致する。元の World と文書は不変である。

一方、文書には町の4地区と元 variant の `edgeMessage` がなく再構成後に失われる。start・カタログ・文書IDは参照表示だけにはないため今回外部から補っている。年代や生成関数は編集文書だけから復元できない。これらの欠落と、描画順・全体の衝突／到達性は raw 往復だけで安全と判断できない。

### 検証との衝突

各 NPC のフォーム固有条件（NPC種別と空でない lines 配列）と共通の形検査は10件とも通る。空の地形と各 NPC だけから作った **合成ワールド**でも、各 NPC は厳密 backend に拒否されなかった。描画候補と参照カタログは調査用に実データから組み立てたものであり、実ワールドの周辺状況の検証ではない。

実ワールド全体を編集文書として厳密 backend に渡すと、NPC以外の `objects[].style` にある数字文字列 `0`〜`4` が ID の書式で61件拒否される。shape 検証で止まるため、その後の重複・衝突・到達性は未判定。NPC自身の拒否を捏造したり、実データや検証を緩めたりしていない。入力を変えた合成テストでは、不正 ID・空の会話・未宣言 sprite を拒否することも確認する。

## 方式の選択肢（未採用）

| 候補 | 今回の観測 | 今後の検証・合意 |
| --- | --- | --- |
| 生成後の安定ID付き差分 | 現在は明示IDと全ワールド指紋で対象を識別できる | 改名や年代差分の所有、生成順・スコープの変更時の競合 |
| 編集用 JSON への抽出 | NPC の raw 属性・lookup は往復できた | 地区・variant・start・描画順・参照先とバックエンドの形式の整合 |
| 管理対象 TS の生成 | 同じ事前検査を使う評価は可能 | 生成元の関数や手書き部分を含む所有範囲、出力先、再生成とレビュー手順 |

## 共通 dry-run と再現方法

マップ評価と同じ `sourceFingerprint` と結果形式を用いる。指紋は generated World の全 AreaDef（地区を含む）・施設・start・variant を canonical JSON 化した SHA-256 で、配置物や会話など配列の順は保持する。source ID の一意解決、独立入力の scope、厳密 backend と NPC 固有の会話条件を確認し、成功したときだけコピーした candidate を返す。匿名の表示用ID、異なる指紋、範囲外、空会話を拒否する。元の World は変更しない。

```sh
node scripts/npc-persistence-check.mjs inventory
node scripts/npc-persistence-check.mjs inventory --markdown
node scripts/npc-persistence-check.mjs roundtrip
node scripts/npc-persistence-check.mjs dry-run /tmp/request.json /tmp/scope.json
node scripts/npc-persistence-check.mjs dry-run /tmp/request.json /tmp/scope.json --write-temp
```

game/ で Node.js 24 と既存依存を使用する。request は `schemaVersion: 1`・inventory が表示する `sourceFingerprint`・`operations`、scope は独立した `areaIds`・`targets: [{table,id}]` を持つ。実 World は先述の61件により現時点で rejected／終了コード2、candidate は作られない。合成サンプルで変更可能なことを試した結果を実 World の受理とは扱わない。

通常は標準出力だけ。`--write-temp` を付けた場合のみ OS `/tmp` 実体下の新規ディレクトリに `report.json`・`baseline.json`、成功時だけ `candidate.json` を作る。任意の出力先や実マップへの apply は提供しない。Vite の既存 SSR loader は一時キャッシュを使い終了時に削除し、ポートを開かない。
