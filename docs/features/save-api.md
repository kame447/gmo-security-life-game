# セーブAPI契約とローカルフォールバック（提案）

対象は [Issue #20](https://github.com/kame447/gmo-security-life-game/issues/20)（親 [#38](https://github.com/kame447/gmo-security-life-game/issues/38)）。`game/src/save-api/` の独立モジュールと Node 環境のテストを追加した。

**AWS には未接続・未デプロイで、本編にも未配線。** HTTPサーバー、JWT検証、DynamoDBアダプタ、ブラウザの接続処理は含まない。既存の `state/save.ts`、`app/save-store.ts`、`session/`、`main.ts`、`index.html` と Terraform は変更していない。既存ゲームの保存動作はこの変更では切り替わらない。

## 契約

将来の経路案は CloudFront `/api/*` → VPC origin → 内部ALB → アプリ。既存 `infra/frontend.tf` のキャッシュ無効・全メソッド転送に合わせる。以下はAPIの提案であり、現在リクエストを受けるURLは存在しない。

| 操作 | リクエスト | 成功 |
| --- | --- | --- |
| 読込 | `GET /api/saves/{slotId}`、検証済みCognito IDトークン | `200 { save: SaveEnvelope }` |
| 保存 | `PUT /api/saves/{slotId}`、同トークン、JSON `WriteSaveRequest` | `200 { save: SaveEnvelope }`（新規も200） |

```ts
interface SaveEnvelope {
  schemaVersion: 1;
  slotId: string;
  revision: number;
  updatedAt: string;
  data: { v: number; [key: string]: Json };
}
interface WriteSaveRequest {
  schemaVersion: 1;
  expectedRevision: number;
  idempotencyKey: string;
  data: { v: number; [key: string]: Json };
}
```

`schemaVersion` は封筒、`data.v` はゲーム本体の版。どちらも現在1。`revision` は0以上の安全な整数で、0は未公開のローカルデータ、サーバーは1から単調増加する。新規保存には `expectedRevision: 0` を指定する。`updatedAt` はサーバーが渡すUTCのISO日時（ミリ秒・末尾Z）で、競合判定には使わない。クライアントが送る `userId`・更新時刻・確定リビジョンは権限や更新判断に使わない。

### 提案値と未決定事項

| 項目 | このモジュールの値・扱い |
| --- | --- |
| スロットID | 呼出側が選ぶ `[a-z0-9][a-z0-9_-]{0,31}`。例 `auto` / `manual-1`。パスやユーザーIDを含めない |
| スロット数 | 自動1＋手動2の計3は検討案。**未決定・未実装**。現状は有効IDの数を制限せず、一覧・削除APIもない |
| 保存上限 | `data` のUTF-8 JSONが128KiB以下。封筒・リクエスト全体は共通で129KiB以下（検証済みメタデータ用に1KiBの余地）、JSONの深さは64以下 |
| 冪等キー | 保存ごとに新しい8〜128文字の英数字・`_`・`-`。接続時に一意ID生成関数を渡す（UUID等）。再送では変更しない |
| 応答待ち | リポジトリ既定5秒、構築時に変更可。タイムアウト後の応答は状態に適用しない |
| ローカル未送信 | 最大2件。応答が不明な先頭1件と、まだ送っていない最新の完全なスナップショット1件 |

これらは製品仕様として未合意。特にスロット数とIDの発行方針、容量、バックアップ期間、競合解決のUI、冪等性の保持期間は本番化前に決める。

保存容量の基準は `data` に統一する。ちょうど128KiBの `data` も、スロットID・日時・リビジョン等を付けた封筒で拒否されない。上限を1バイト超える `data` はクライアントの未送信列へ追加する前に拒否する。

### エラーとHTTP

エラー本文は `{ error: { code, current? } }`。`REVISION_CONFLICT` の `current` は同じ認証主体の現在の完全な封筒で、スロット未作成なら省略する。他人の保存内容は返さない。

| コード | HTTP | 意味 |
| --- | --- | --- |
| `INVALID_REQUEST` | 400 | JSONの型・ID・日時・リビジョン等が不正 |
| `UNAUTHENTICATED` / `FORBIDDEN` | 401 / 403 | 検証済み主体なし／利用不可 |
| `NOT_FOUND` | 404 | その主体・スロットに保存なし |
| `REVISION_CONFLICT` | 409 | 期待リビジョンが古い。`current` を提示 |
| `IDEMPOTENCY_CONFLICT` | 409 | 保持中のキーを異なる内容・期待リビジョンで再利用 |
| `TOO_LARGE` | 413 | サイズ超過 |
| `UNSUPPORTED_VERSION` | 422 | 対応しない封筒・ゲーム版。移行や上書きをしない |
| `CORRUPT_SAVE` | 500 | 保存済み封筒等が壊れている。上書きしない |
| `UNAVAILABLE` | 503 | ストレージ等の失敗 |

HTTPアダプタはJSON構文エラーを400へ変換し、JSON解析前にも受信サイズを制限する必要がある。ライブラリの検証は解析済みオブジェクトに対するもの。レスポンスには `Cache-Control: no-store` を設定する。これらのHTTP入出力処理は未実装。

## ゲーム本体との境界・互換

`data` はJSONオブジェクトとして不透明に保持する。位置・向き・年代差分ID・外見、`assets.moneyYen` / `assets.items` / `assets.layout`、`phone.owned` / `phone.dataBudget` / `phone.chat`、さらに未知の欄も削らずコピーする。JSONで失われる `undefined`・関数・NaN・Infinity・循環等は拒否し、暗黙の欠落を起こさない。型のあるゲームDTOも `unknown` として渡せる。

封筒はゲームのアイテム定義、マップ、外見選択肢、スマホ設定を参照しない。位置の有効性や所持数の修復・正当性判定はゲーム側の責務。破損欄を輸送層が既定値へ直すと他機能の値まで消えるため、このモジュールでは行わない。JSONとして有効な偽造資産を判定する仕組みもない。

2026-11-14、親の `git fetch origin --prune` 後に確認した保存形式：

| ブランチ / head | 保存形式 |
| --- | --- |
| main `ee756d5` | `v: 1`、位置・向き・エリア・年代差分ID・任意の外見 |
| inventory-wallet-save `98c461d` / shop-purchase `9e3ba66` | v1に `assets: { moneyYen, items }` |
| clothing-contract `b0f51ef` | 同じv1、外見・資産・スマホが共存 |
| bag-hotbar-inventory `6157a51` | `assets.layout: { v: 1, bag, hotbar, selectedHotbar }`。数量は `items` に保持 |
| smartphone-foundation `3c89216` | `phone: { v: 1, owned }` |
| phone-chat-model `1a94646` / smartphone-data-preview `888f601` | 所持、通信容量・残量・任意の保存時刻/稼働状態、任意のチャットDTO |

各ブランチの保存型・保存アダプタ・関連テストを読み、後二者の差分も確認した。契約テストではmainの実際の `Game.serialize()` と、上記の欄を併せたv1サンプルを往復し、未知欄・チャット・ホットバー・残高・外見が等しいことを確認する。各開発ブランチを本編へマージして試験したわけではない。

## 認可・ストレージ・競合

`AuthenticatedPrincipal.sub` は、HTTP境界でCognito IDトークンを検証してから渡す。単にJWTをデコードした値を渡してはならない。署名・issuer・audience・`token_use=id`・有効期限等の検証は未実装。`canSave: false` は認証済み主体の利用拒否を表す。

純粋関数 `authorize` が `pk = USER#<encodeURIComponent(sub)>`、`sk = SAVE#<slotId>` を生成する。`readSave` / `writeSave` は現在のレコードと検証済み主体から応答と次状態を返す。`SaveService` はこのキーだけで `SaveStorage` を読み書きする副作用アダプタ。リクエストの所有者指定に切り替える分岐はない。誤って別所有者の行が渡っても403。テストで異なるsubの読込・書込分離を確認する。

`SaveStorage.read` は強い整合性、`compareAndSwap` は全書込元を通じた原子的な条件付き更新を要求する。`MemorySaveStorage` は1つのJS isolate内の参照実装。リビジョンが一致した場合だけ、封筒と直近の冪等キーを一緒に更新する。同時更新では一方だけ成功する。

直近の保存と同じキー・期待リビジョン・JSON内容なら、同じ応答を200で返しリビジョンを増やさない。JSONメンバーの順序は問わない。別の書込後は前のキーの応答を保持せず、古い期待リビジョンに409を返す。この場合も上書きは起きない。キーは主体・スロットの生存期間中に再利用しない前提。長期の成功応答再現や削除・再作成は未対応で、必要になれば保持方針とスキーマを決める。

### 既存DynamoDB定義との照合

`infra/dynamodb.tf` は文字列 `pk` / `sk` の複合キーなので上記の候補を格納できる。保存項目案は `pk`, `sk`, `ownerSub`, 数値 `revision`, JSON文字列の封筒、直近の冪等キーと期待リビジョン。新規は `attribute_not_exists(pk)`、更新は `revision = :expected` を条件にし、項目全体を一度に書く。封筒129KiB以下により、DynamoDBの400KB項目上限内にキー等の余地を残すが、実アダプタでは項目全体のサイズも検証する。

既存Terraformは汎用キーの仮置きで、保存用の属性設計、条件式、強い整合性の読込、冪等性の保持、スロット数制限、アプリのキー分離を実装しない。PITRと暗号化が有効でも利用者の任意履歴復元APIにはならない。`infra/ec2.tf` の権限にGet/Put/Update等はあるが、アプリ内認可を代替しない。EC2の起動処理はヘルスチェック用で、APIアプリの配置先・実行方式は未決定。Terraform変更・plan/applyは実施していない。

## ローカルフォールバック

`LocalSaveJournal` にはlocalStorageと同形の `getItem` / `setItem` を返す関数を渡す。DOMを参照せず、グローバルの取得時に例外が起こる環境でも動く。キーは `slg-save-api-v1:<encoded sub>:<slotId>`、記録は版・所有者・スロット・最後の確定封筒・未送信リクエスト。ローカルキーのsubとリモートの認証主体を揃え、ログイン主体の変更時はリポジトリを作り直す。主体間で未送信分を引き継がない。

`save` は完全なゲームDTOをローカルへ記録してから送信する。送信した可能性のある先頭の内容・キーは固定する。その後の未送信分は最新の完全なDTOで置き換え、長いオフライン中でも最新進行を保持する。確定応答が検証できたときだけ先頭を消す。資産・スマホ・位置を別々にマージしない。

| 状況 | 動作 |
| --- | --- |
| ネットワーク失敗・5秒超過・5xx | 未送信の内容とキーを維持。`sync()` で明示的に再送 |
| サーバー確定後の応答喪失 | 同じリクエストを再送。直近なら200で元の確定を得る |
| 401・403 | 手元の進行を維持。再認証・利用可否の解決後に同一主体で `sync()` |
| 409 | ローカルの最新進行とサーバーの `conflict` を分けて返す。自動マージ・リビジョンの付け替え・強制上書きはしない |
| 壊れた応答・別スロット・期待と異なるリビジョン/内容 | `INVALID_RESPONSE`。既存の確定コピーや未送信分を置き換えない |
| 対応しない未来版 | `UNSUPPORTED_VERSION`。元データを変更せず、未送信分を残す |
| ローカルが壊れている・未来版・所有者不一致 | 元の文字列を保護して書き換えず、リモート送信も止める。新しい進行はメモリだけで保持 |
| localStorageなし・取得拒否・容量不足 | 例外を外へ出さずメモリへ保持し、`durable: false` を返す。リモート送信は可能 |

`load()` は未送信分がある場合はローカルの最新進行を返す。未送信分がない場合だけリモートを読み、古いリビジョンや同じリビジョンの異なる内容は拒否する。404も既存の確定コピーを消さない。操作はリポジトリ内で直列化し、遅い応答が新しいローカル進行を消さない。

`durable: false` のメモリ記録はページ終了で失われる。初回にローカル記録を読めなかった場合、このインスタンスは元の文字列を知らないので以後の書戻しも行わない。永続領域が利用できない場合に端末終了後の保持は保証できないため、本編接続時はこの状態を利用者に伝え、必要なら書き出し手段を設ける。同一主体・スロットにつき1つのリポジトリを使う前提で、タブをまたぐローカル記録の同時更新調停は未実装。競合解決・保護されたローカルデータの退避/復旧UIも未実装。

呼出例（本編には追加していない）：

```ts
const local = new LocalSaveJournal(verifiedSub, 'auto', () => localStorage);
const repository = new SaveRepository(local, authenticatedHttpAdapter, () => crypto.randomUUID());
const restored = await repository.load();
// restored.data を既存ゲーム側で検証してから使う。
const result = await repository.save(completeGameSnapshot);
// result.problem / durable / conflict を接続先UIで扱う。
await repository.sync(); // 接続復旧時の明示的な再送
```

`SaveRemote` は解析済み `{ status, body }` を返すポート。実際のfetch・Authorizationヘッダー・JSON解析・キャンセルは将来のHTTPアダプタが担当する。タイムアウトがリモートの更新自体を取り消したと判断しない。

## 移行

既存 `slg-map-save-v1` の文字列を `importLegacy(rawText, slotId, importedAt)` に渡すと、データを変えずリビジョン0の封筒に載せる。mainの旧形式と開発ブランチの拡張v1を同じ経路で取り込む。元キーは読み取り・削除・書き戻しを一切行わない。ログイン主体が決まった後に、既存キーの所有者を利用者が選び、リモート/ローカルの既存保存と競合しないことを確認して、封筒の `data` を `save()` に渡す。本編に自動移行は配線していない。

将来ゲームの版を上げるときは `GAME_VERSION` を変更し、`GameMigrations` に `register(1, data => ({ ...data, v: 2, ...追加欄 }))` のように1段階ずつ登録して、読込/インポート境界へ接続する。未登録の段階、段階を飛ばす出力、未来版はエラーとし原本を変更しない。移行はコピーを受け取り、未知欄を保持する責務がある。封筒版は別契約なので、封筒版を上げる場合には別途移行を実装する必要がある。現時点に架空のv2移行は追加していない。

## 設計判断と本番化の残作業

判断記録の採番ルールと0005の重複解消が `team-workflow.md` で未決定のため、今回の判断はこの節に記録し、番号を新しく確定しない。

- ゲームDTOを不透明な完全スナップショットとして運ぶ。各機能の現行codecへ依存すると、別ブランチや画面を持たないビルドで未知欄を消すおそれがあるため。
- 確定リビジョンと未送信リクエストを分ける。通信失敗はサーバー未保存の証拠にならないため、再送時のキー・内容を固定する。
- 競合時は全体を保持して解決待ちにする。金額と購入品、バッグ配置、スマホ進行の自動的な欄別マージは整合性を証明できないため。
- 認証済みsubからのみ所有者キーを作る。ブラウザ送信のuserIdやローカルのキーは認可根拠にしない。

本番化には、APIの実行環境と配置/監視方法、DynamoDBの物理項目・条件式と障害時の実地試験、CognitoのJWT検証と鍵更新/失効対応、ログイン/ログアウト、CORSの許可元・プリフライト、キャッシュ防止、レート/スロット数/受信サイズ制限、エラー表示・競合解決・バックアップ/復旧手段、ゲームDTOの検証と本編への配線が必要。トークンやゲーム本文をアクセスログへ残さない方針も決める。実AWSへの接続、認証情報の読取り、plan/apply、デプロイは行っていない。

## 検証

`game/tests/save-api-contract.test.ts`、`save-api-server.test.ts`、`save-api-repository.test.ts` はVitestのNode環境で実行する。封筒と移行、未知欄の往復、主体分離、同時保存・重複・古い端末、ネットワーク/タイムアウト/HTTP失敗、破損/未来版、未送信分の再読込と再送、永続領域の失敗を対象とする。GUIや開発サーバーは不要。

```sh
cd game
npm ci --cache /private/tmp/slg-save-api-npm-cache
npm run build
npm test
```
