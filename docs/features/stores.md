# 店舗の店内と接続契約

[Issue #33](https://github.com/kame447/gmo-security-life-game/issues/33) のうち、名前付きの商店・飲食店7店を対象にする。既存コンビニを保持し、やおや・ほんや・だがしや・パンや・きっさてん・くすりやの店内、商品棚やテーブル、店員の挨拶、往復の出入口を追加する。

**利用者レビュー前の試作。** 店の広さ・家具・店員名・台詞は暫定で、営業時間・年代による開閉・商品・価格・在庫は決めていない。通常の会話欄で挨拶まで進む。購入UI・資産更新は [#21](https://github.com/kame447/gmo-security-life-game/issues/21) の採否が決まった後に接続する。既存の屋外会話や自販機を購入の入口にしない。

`feat/store-interiors` は店舗モジュール・契約・単体検証を持つ。町の既存ファイルはCoralの `feat/store-interiors-wiring` が接続し、実際に歩けるプレビュー、ブラウザ検証、撮影には**配線枝のビルド**を使う。モジュール枝だけの通常ゲームが全店接続済みとは扱わない。利用者が実画面ではっきり了承するまで、Draftを含めPRは作らず、マージしない。

## 対象と接続

屋外はすべて `town-main`。既存の店舗外観8棟のうち、名前付き施設7件を接続対象にする。施設未紐付けのカフェ外観は別物として棚卸しし、正式名称や既存喫茶店との関係が未決定なので今回の室内追加から除外する。

| 店 | 施設／店舗ID | 既存外観のID | 入口ID | 屋外入口 → 帰還タイル | 室内の広さ |
| --- | --- | --- | --- | --- | --- |
| やおや | `shop-greengrocer` | `town-shop-30-47` | `greengrocer-enter` | `(33,52)` → `(33,53)` | 16×12 |
| ほんや | `shop-bookstore` | `town-shop-37-47` | `bookstore-enter` | `(40,52)` → `(40,53)` | 18×12 |
| だがしや | `shop-candy` | `town-shop-44-47` | `candy-enter` | `(47,52)` → `(47,53)` | 14×10 |
| コンビニ（既存） | `shop-konbini` | `town-shop-51-47` | `konbini-enter` | `(54,52)` → `(54,53)` | 14×10 |
| パンや | `shop-bakery` | `town-shop-58-47` | `bakery-enter` | `(61,52)` → `(61,53)` | 16×12 |
| きっさてん | `shop-cafe` | `town-shop-65-47` | `cafe-enter` | `(68,52)` → `(68,53)` | 18×14 |
| くすりや | `shop-pharmacy` | `town-shop-72-47` | `pharmacy-enter` | `(75,52)` → `(75,53)` | 16×12 |
| 未紐付けのカフェ外観（対象外） | なし | `town-shop-60-59` | なし | なし | なし |

新規6店は既存の家具・NPC描画を使い、コード生成スプライトや主人公の外見定義を変更しない。やおやとくすりやはタイル床、本屋・だがしや・パン屋は木の床と商品棚、喫茶店は木の床・テーブル・ソファを使う。見た目と配置はレビュー対象であり、独自の完成素材を追加した扱いではない。

自販機 `shopping.vending` は建物ではないため除外。屋外の `candy-shopkeeper`／`shopping.candy` は既存会話のまま保持し、店内の `candy-indoor-clerk`／`shopping.candy.clerk` と別の対象にする。既存コンビニの室内定義・棚・店員名・台詞・ポータル・到着位置は変更しない。

## 店内を足すデータ

`game/src/world/shops/definitions.ts` の `SHOP_INTERIORS` が新規6店のデータを持つ。ID、表示名、広さ、床、入口列、既存屋外ドアの座標、店員、家具を1件ずつ記載する。家具の `id` は座標と独立した識別子で、`name` と `line` を持つ家具は調べられる棚やテーブルになる。

`world/shops/index.ts` は宣言データから毎回独立した `AreaDef` を作り、次の口を公開する。

- `SHOP_AREA_FACTORIES`: 6店の `() => AreaDef`。結線担当が `AREA_FACTORIES` へ追加する。
- `SHOP_ENTRANCES`: 6件の屋外 `PortalDef`。結線担当が町の `portals` へ追加する。
- `createShopInterior(definition)`: 同じ形式の店舗データから室内を作る。

追加店の室内IDは `shop-<id>-interior`、出口IDは `<id>-exit`、店員イベントは `shopping.<id>.clerk`。入口は `SHOP_ENTRANCES.to` が示す室内最下段の1つ北に上向きで到着し、横2タイルの出口から元の屋外ドアの1つ南へ下向きで戻る。これは今回の名前付き店舗の接続値であり、将来の全店の命名規則を確定したものではない。

## 買い物側との契約

`game/src/data/stores.ts` のUI非依存な `StoreContact` を共有する。配置データ、商品、価格、購入画面はこのファイルに持たせない。

| フィールド | 参照するもの |
| --- | --- |
| `storeId` | 一意な店舗ID。今回の7件は既存施設IDと同じ |
| `interiorAreaId` | `World.areas.get(id)` で解決する屋内 |
| `entrancePortalId` | `AreaRuntime.def.portals[].id` の元ID |
| `clerkEventKey` | 指定店内にいるNPCのイベントキー |
| `catalogId` | #21側のカタログへの文字列参照。今回の新店用カタログは未実装 |

`storeForClerk(areaId, eventKey)` はエリアとキーの両方が一致したときだけ店舗を返す。屋外・棚・別室での同名キーからは店員との購入導線を開始しない。売買への実接続には、#21側でもNPCであることを照合する。

`stores/validate.ts` の純粋関数 `validateStoreContacts(world, records)` は `{ storeId, code }[]` を返し、入力を変えない。重複店舗・重複した室内と店員キーの組、店内欠落・屋外を室内として参照、入口の欠落・重複・異なる行き先、元の屋外への出口欠落、店員の欠落・重複・NPC以外の参照を報告する。座標・衝突・到達性は `validateWorld()` と実際の移動で確認し、カタログの存在はここで判定しない。

## 店舗を追加・編集する手順

1. 対象の施設・外観と接続IDを確認する。未紐付け外観の正体を推定で決めない。
2. 店内担当が `world/shops/definitions.ts` に室内と暫定店員を追加する。既存コンビニは従来の `interiors.ts` で管理する。
3. 店内担当が `data/stores.ts` と棚卸しfixture・文書を更新する。カタログを追加する必要があれば#21担当とIDを合わせる。
4. town/index担当が `SHOP_ENTRANCES`・`SHOP_AREA_FACTORIES` と施設の `interior: 'full'` をつなぐ。同じ既存ファイルを並列編集しない。
5. 配線された実Worldで契約・一般ワールドの検証、屋外→棚の前→店員→出口、衝突、店内・帰還後の保存復帰を確認する。利用者には3サイズの実画面と操作できるプレビューを示す。

GUIの `reference-*` のような補助表示IDを正式な入口や店内の参照へ流用しない。編集基盤には通常の `AreaDef`・元の配置物/出入口/NPCのIDが渡る。GUIからTypeScriptソースを直接永続編集する仕組みや、年代による営業条件はこの変更で追加しない。

## 検証

```sh
cd game
npm ci --cache /private/tmp/slg-npm-cache
npm run build
npm test
```

`tests/stores.test.ts` は7件の契約・8棟の棚卸しと不整合検出、6店すべての棚やテーブルの前への経路、全ての固体家具での実移動の停止、店員の挨拶中の移動停止、同じ店内での位置・向き・外見の保存復帰、元の屋外への帰還を検証する。既存コンビニの往復回帰も保持する。

**単体と実接続の境界:** モジュール枝だけでは通常Worldに新店が未登録なので、`buildStoreFixtureWorld()` が公開されたfactoryと入口を組み合わせる。新店の登録が1件でも存在するWorldでは補完を行わず、実際の `buildWorld()` をそのまま検査する。配線が半端な状態をfixtureで埋めて成功させない。ブラウザE2Eと撮影は、このfixtureを一切使わない。

配線枝のプレビューに対して親がsandbox外で実行する（5173はCI既定値。別ポートは `SLG_URL` で指定）。

```sh
SLG_URL=http://127.0.0.1:5201 node scripts/e2e-store-interiors.mjs
SLG_URL=http://127.0.0.1:5201 SLG_SHOTS=/absolute/output node scripts/shots-store-interiors.mjs
SLG_URL=http://127.0.0.1:5201 node scripts/e2e-store-contract.mjs
SLG_URL=http://127.0.0.1:5201 node scripts/e2e.mjs
```

新規E2Eは実Worldの検証1件と7店×4件の29項目。実キーでの入店・棚前の衝突・調査、店員への挨拶・入力停止と復帰、店内での再読込、帰還と屋外での再読込を確認する。歩行を離す前後の正常な移動とポータルの到着を混同せず、到着の瞬間は通知時に記録し、会話の前後・再読込は入力解放後の位置を厳密に比較する。テレポート、保存データのseed、メソッド置換は行わない。

撮影は1280×800・390×844・844×390で、各店の室内と挨拶の42枚。縦横の小画面ではタッチAと会話欄のタップでも開始・終了を確認する。新規スクリプトは同じloopback origin以外へのHTTP/WSを遮断し、ダウンロードを拒否する。画像は明示した `SLG_SHOTS` だけに出力する。起動/終了するサーバーや共有スクリプトは変更しない。

単体の成功だけで実接続・ブラウザ・見た目の了承を済ませたことにはしない。未紐付けカフェ、購入UI、商品カタログ、年代ごとの店舗差分は残件として区別する。
