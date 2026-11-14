# 保存サーバーの HTTP 境界と ID トークン検証（AWS 未接続）

[Issue #20](https://github.com/kame447/gmo-security-life-game/issues/20)（親 [#38](https://github.com/kame447/gmo-security-life-game/issues/38)）の接続準備。[保存契約](save-api.md)と[HTTP・DynamoDB アダプタ](save-api-http.md)を使い、別モジュール `game/src/save-server/` に HTTP と署名検証を追加した。

**実 AWS 未接続・未デプロイ・本編未配線。** SDK 依存、実クライアント、SSM 読取、実環境の JWKS 更新、ログイン UI は追加していない。既存の `save-api/`、ゲーム本体、package.json・lockfile、Terraform は変更していない。Node 24.22.1、ローカルの生成鍵、注入した DynamoDB モックだけで検証した。後述の「起動入口と設定の追記」で、明示的に backend を注入する起動入口を追加した。

## Terraform から読み取れる条件

以下はリポジトリの定義を読んだ結果であり、稼働中の AWS 設定を取得した結果ではない。変数の実値・実リソース ID は未取得。

| 対象・根拠 | 定義とサーバーが満たす条件 |
| --- | --- |
| `infra/alb.tf` | 内部 ALB のリスナー HTTP:80、ターゲットグループ HTTP:80、EC2 attachment:80。デフォルトアクションで転送。アプリは最終的に EC2 の80番へ到達する必要がある |
| `infra/variables.tf` | ヘルスチェックの既定は `/api/health`、成功条件200。`GET /api/health` を認証・DB 読取なしで返す。実値を変更している環境は `healthPath` を合わせる |
| `infra/frontend.tf` | API の既定パターン `/api/*` → `alb-api` → VPC origin → ALB。origin path、API の Function / Lambda の関連付けはなく、`/api` の除去や書き換えはない。SPA rewrite は静的ファイル側だけ |
| 同上 | viewer HTTPS へリダイレクト。VPC origin は HTTP:80（http-only）、HTTPS:443 の値は宣言されているが使用されない。GET/HEAD/OPTIONS/PUT/POST/PATCH/DELETE を転送可能 |
| 同上 | `Managed-CachingDisabled`。cached_methods に GET/HEAD があってもキャッシュ無効のポリシーを指定している。アプリ応答にも `Cache-Control: no-store` を付ける |
| 同上 | `Managed-AllViewerExceptHostHeader` を指定。ポリシーの意図は Host 以外の viewer ヘッダー（Authorization を含む）、Cookie、query の転送。Host はオリジン用になるため認可に使用しない。マネージドポリシーの実内容・Authorization の実到達は接続時に確認が必要 |
| `infra/security_groups.tf` | ALB は CloudFront 由来の80番のみ、EC2 は ALB の80番のみ許可。アプリが任意の別ポートで listen するだけでは到達しない |
| `infra/cognito.tf` | issuer は `https://cognito-idp.<region>.amazonaws.com/<pool-id>`、aud は web クライアント ID。ID と access は60分、refresh は30日。secret なし、認可コード + PKCE / SRP、openid/email/profile。保存 API の ID トークン採用はこのモジュールの前提であり Terraform が API の token_use を強制するわけではない |
| 同上 | メール認証、任意 TOTP、セルフサインアップ既定有効。`enable_token_revocation=true` でもオフライン署名検証だけで個別トークンの失効は判定できない |
| 同上・`infra/locals.tf` | `/<project>/<environment>/cognito/{user-pool-id,client-id,issuer,jwks}` の SSM String。Terraform が JWKS URL `issuer + '/.well-known/jwks.json'` を取得して保存する |
| `infra/network.tf` | EC2 はプライベートサブネット、NAT・外向きインターネットルートなし。DynamoDB/S3 は Gateway endpoint、SSM/Logs 等は Interface endpoint。EC2 から公開 JWKS URL の直接取得や npm install を行う前提にしない |
| `infra/ec2.tf` | EC2 一台、インスタンスプロファイル、IMDSv2 必須、暗号化 root。Launch Template / Auto Scaling Group はなく `aws_instance` の `user_data` を使用 |
| `infra/templates/user_data.sh.tftpl` | Python の仮 HTTP サーバーが80番、`/srv/app/api/health` が `ok`。Node の導入・コード配布・常駐化・設定読込はない。置き換える際は80番の競合を解消する |
| `infra/ec2.tf` IAM | 対象テーブル/インデックスへの GetItem/PutItem/UpdateItem/DeleteItem/Query/BatchGetItem/BatchWriteItem。今回のアダプタが必要とする GetItem/PutItem は含まれる。SSM GetParameter/GetParameters/GetParametersByPath は上記 prefix 配下に許可される |
| `infra/dynamodb.tf` | テーブル名 `<project>-<environment>`（既定 `security-life-game-dev`）、文字列複合キー `pk`/`sk`、PAY_PER_REQUEST、PITR・暗号化有効。既存 DynamoSaveStorage の単一項目 CAS と適合。保存用の属性やユーザー分離はアプリが担う |
| `infra/outputs.tf`・`variables.tf` | table、pool-id、client-id、issuer、parameter prefix は output、region 既定 `ap-northeast-1` は入力。実環境の値はデプロイ担当が渡す必要がある |

`cognito.tf` のコメントには「apply 時点の JWKS で足りる」とあるが、この実装は鍵が将来も同じであることを保証しない。Terraform が保存したスナップショットと運用中の有効な鍵を同期する手順、取得障害時の扱い、未知 kid 時の更新方針は未決定である。

## モジュールと設計理由

- `jwt.mjs` / `jwt.d.mts`: Node crypto による純粋な `verifyCognitoIdToken` と、`getJwks` を受け取る `createCognitoIdTokenVerifier`。純粋関数には時刻を秒単位で渡す。署名・RS256・RSA（2048 bit 以上）・kid の一意一致・iss・aud の文字列一致・token_use=id・exp・任意 nbf を検証し、`{ sub }` のみ返す。スキューは明示設定、既定0秒。署名検証に用いる鍵は注入 JWKS のみで、トークンの jku/jwk は参照しない。none/HS256、不正な鍵用途、未対応の crit/b64 を拒否する。
- `http.mjs` / `http.d.mts`: `node:http` のサーバーを構築する。フレームワークなし。明示的に `listen` するまで通信しない。JWT 検証関数とサービスを注入する。Node の依存や型をブラウザの入口へ import しない。
- `service.ts`: `createSaveHttpService(storage, now?)` と `createSaveServer({ storage, verifyToken, healthPath?, now? })`。既存 SaveService をリクエスト単位で作り、既存の MAX_SAVE_WIRE_BYTES を HTTP の上限へ渡す。

既存 package/lockfile に `@types/node` がないため、Node 標準 API を直接使う箇所をネイティブ `.mjs` と小さな構造的型宣言にした。既存の TypeScript ビルドは呼出側、サービス、テストを型検査する。`.mjs` の実装はテストと Node の構文検査で確認する。`service.ts` は既存 TypeScript を import するため、そのまま Node の型削除だけで実行せず、将来の起動エントリと一緒に Node 用にバンドルする（既存コードの拡張子なし import とコンストラクタの parameter property に対応するため）。

既存 SaveService は read 例外を一律 UNAVAILABLE に変える。境界のストレージ decorator は **そのリクエスト中の read** で投げられた `SaveError('CORRUPT_SAVE' / 'UNSUPPORTED_VERSION')` だけを記録し、サービスが503を返した場合に500/422へ変換する。同じ読取をもう一度行う必要はなく、共有の「最後の例外」状態も持たない。CAS、再読取、冪等性判定は既存サービスに任せる。未知のストレージ例外・書込例外は503のままにする。ドライバーが型付きエラーを返さない場合は詳細を復元できないので503となる。

設計判断の採番は `team-workflow.md` の未決定事項に従い、この文書内に理由を記録する。既存ファイルを変更しない作業範囲のため、機能目次や決定目次への追記もしていない。

## HTTP の振る舞い

| 条件 | 応答 |
| --- | --- |
| `GET /api/health` | 認証不要、200 `{ ok: true }`。プロセスの生存確認であり DB の readiness は保証しない |
| `GET` / `PUT /api/saves/{slotId}` | 検証済み sub を渡して既存 SaveService を呼ぶ。成功200、保存なし404、競合409 |
| 認証なし・不正/重複 Authorization・署名/claims 検証失敗 | 401 UNAUTHENTICATED。Cookie は認証に使わない |
| JWKS 取得関数の失敗 | 503 UNAVAILABLE。未知 kid は401。公開 URL の自動再取得はしない |
| 生の受信本文が129KiB超 | 413 TOO_LARGE。Content-Length による事前拒否とチャンクごとのバイト計数。JSON 解析前に読み取りを止め、接続を閉じる |
| JSON 構文エラー・不正 UTF-8・JSON 以外の Content-Type・identity 以外の Content-Encoding | 400 INVALID_REQUEST。Content-Type は application/json（任意の charset=utf-8）のみ |
| data 自体が128KiB超 | 既存契約の413。全体129KiB以下でも data の制限を別に守る |
| 保存済みデータの破損 / 未来版 | 500 CORRUPT_SAVE / 422 UNSUPPORTED_VERSION。読込・上書きの両方を拒否、元データ保持 |
| ストレージのその他の例外 | 503 UNAVAILABLE。本文や例外詳細を返さない |
| 不明パス / 対応パスの不許可メソッド | 404 NOT_FOUND / 405 METHOD_NOT_ALLOWED + Allow。405は輸送層の追加コードで既存 API 契約は変更していない |

すべてのアプリ応答に `Cache-Control: no-store` と JSON の Content-Type を付ける。Node の `clientError` で扱う不正 HTTP の400・ヘッダー超過431にも no-store を付ける。Node 自身が先に拒否するメッセージや ALB/CloudFront のエラーまで同じ JSON 形式に統一するものではない。HTTP フレーミングの判定は Node に任せる。

パスは URL の正規化をせず生の文字列で照合する。query はルーティング・認可に使わない。userId、ownerSub、クライアントの時刻・revision、その他の JWT claims は所有者指定にならない。別人の有効トークンは別の sub の保存にだけアクセスする。JWT に利用停止を示す独自 claim があっても `canSave` へ変換しない。利用停止ルールが必要なら、別途合意したサーバー側認可を追加する。

HTTP 本文・ヘッダーの待ち時間は Node の5秒設定（確認間隔1秒）を指定する。本文受信にはリクエスト単位の独立した5秒タイマーも使い、Node が停止処理に入っても未完了の本文に期限を適用する。JWKS/ストレージ処理の期限、HTTP 応答後の処理の取消は実装していない。接続先は SDK/provider の期限も設定する必要がある。トークン・鍵・Authorization・保存内容をログに出す処理はない。

## ローカルでの起動と確認

依存の追加は不要。既存依存が導入済みの状態で次を実行する。

```sh
export PATH=/Users/Shogo/.local/share/fnm/node-versions/v24.22.1/installation/bin:$PATH
cd game
npx vitest run tests/save-server-jwt.test.ts tests/save-server-http.test.ts
npm run build
npm test
```

結合テストは `createSaveServer` を呼び、`server.listen(0, '127.0.0.1', callback)` でエフェメラルポートを開く。テストが既存 HttpSaveRemote の相対パスへループバック origin を加え、既存 SaveRepository → 実 HTTP → JWT → SaveService → DynamoSaveStorage → モックまで通す。各テスト後に接続・listener を閉じる。鍵はその場で生成し、保存・出力しない。テスト用署名器は `tests/` だけに置き、本番の認証経路から参照しない。

汎用の HTTP モジュール自体は Node で直接 import できる。以下は初回実装時の接続例。現在の起動入口の呼び方は末尾の追記を参照する。

```ts
import { createSaveServer } from './src/save-server/service';
import { createCognitoIdTokenVerifier } from './src/save-server/jwt.mjs';
import { DynamoSaveStorage } from './src/save-api/dynamodb';
// sdkClient は後述の追加依存で作る。getTrustedJwks は SSM 経由の設定 provider。
const storage = new DynamoSaveStorage(sdkClient, tableName);
const verifyToken = createCognitoIdTokenVerifier({ issuer, clientId, getJwks: getTrustedJwks,
  clockToleranceSeconds: agreedClockToleranceSeconds });
const server = createSaveServer({ storage, verifyToken, healthPath });
server.listen(80, '0.0.0.0', () => { /* 認証情報を含まない開始通知だけ */ });
// 停止時には server.close で新規受付を止め、処理中リクエストの終了方針を決める。
```

## AWS 接続までの手順（未実施）

1. **起動形態と製品仕様を合意する。** ID トークンを保存 API の資格情報に使うか、許容スキュー、JWKS/失効、容量・スロット数・冪等性保持・競合解決、レート制限を決める。同一 origin を前提としているため CORS は追加していない。別 origin が必要なら許可元と preflight を設計する。
2. **サーバー依存を追加する変更を別途用意する。** DynamoDB には `@aws-sdk/client-dynamodb` の DynamoDBClient/GetItemCommand/PutItemCommand が必要。Parameter Store を SDK で読むなら `@aws-sdk/client-ssm` の SSMClient/GetParametersCommand 等が必要。今回 package.json/lockfile と SDK import の起動用ファイルは追加していない。EC2 内 npm install に頼らず、許可したビルド環境で依存とアプリの配布物を作る。
3. **設定値を受け取る。** region、dynamodb_table_name、cognito_user_pool_id、cognito_user_pool_client_id、cognito_issuer、app_parameter_prefix、health_check_path。デプロイ担当が既存 outputs/環境設定と照合する。SSM の user-pool-id / client-id / issuer を同一環境に揃え、issuer がその region/pool に対応することを確認する。これらをリクエストの Host/query や未検証 JWT から決めない。
4. **SDK のポートを配線する。** 例は下記。SDK のデフォルト credentials provider で EC2 インスタンスプロファイル（IMDSv2）を使用し、静的 AWS key を持ち込まない。Get/Put の SDK 例外を独自の文字列に変えず既存ドライバーへ渡す。DynamoSaveStorage が強整合読取と条件付き更新を指定する。

   ```ts
   // 必要な依存を追加した後の起動側の例。現在は実行できない。
   import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
   const sdk = new DynamoDBClient({ region }); // timeout/retry 方針は別途設定
   const sdkClient = {
     getItem: input => sdk.send(new GetItemCommand(input)),
     putItem: input => sdk.send(new PutItemCommand(input)),
   };
   ```

5. **信頼する JWKS provider を用意する。** SSM の `<prefix>/cognito/jwks` の JSON を取り込む。公開取得元 URL は固定 issuer の `/.well-known/jwks.json`。現在の EC2 は直接取得不可なので SSM を読む。キャッシュの期限・再読取・未知 kid 時の更新・更新失敗時に既知鍵を使い続ける条件を決め、provider からの取得にも期限を設ける。このモジュールは URL・取得・キャッシュを持たず、呼出しごとに provider を呼ぶ。
6. **Node 向けに配布物を作る。** 既存フロントビルドとは別に、起動 entry を既存 esbuild（Vite の依存）等で `platform: 'node', target: 'node24', format: 'esm', bundle: true` にする。Node 組込みは external。SDK を外部化するなら対応する依存も配布する。起動は Node 24 の `node <server-entry.mjs>`。初回実装では entry を追加していなかったが、末尾の追記で SDK を含まない entry とそのローカル実行手順を追加した。配布・常駐化は未実装。
7. **EC2 の起動手順を用意する。** user_data の Python サーバーを止める置換手順、Node/配布物の導入、非 root での80番 listen を可能にする systemd 等の設定、再起動・停止・ロールバックを決める。ALB/SG の80番を維持するか変更するかは担当者の判断が必要。現在はその変更やデプロイをしていない。
8. **IAM・ネットワークと実到達を検証する。** 既存ロールの GetItem/PutItem、SSM prefix 読取は定義上足りる。テーブル・region・SSM prefix の実値と endpoint policy、実ロールの適用は未検証。ALB のヘルスチェック、CloudFront からの Authorization と no-store、他人の sub の隔離、条件競合・冪等再送、サイズ境界、スロット破損/未来版、障害・復元を実環境で確認する。PITR は任意履歴を返すアプリ API にはならない。

## 初回の検証結果と限界

Node 24.22.1、既存キャッシュからの `npm ci --offline` で検証した。`npm run build` 成功、Vitest **17ファイル381件（今回追加58件）**、CLI **13件**がすべて成功。追加テストは JWT 35件、HTTP 結合23件。129KiB の本文が終わる前でも上限超過を413にすること、ちょうど128KiBの data を保存→読込→再保存できることも確認した。

ブラウザの `dist/` には `save-server`、`node:http`、`node:crypto`、サーバー固有の識別子が含まれないことを検索で確認した。実 AWS・外部認証サービスへの接続、認証情報取得、Terraform init/plan/apply、デプロイ、GUI/E2E、本編配線、Issue/PR 更新は実施していない。SDK の実クライアントとサーバー配布物の本番起動は、このローカル試験の成功から保証されない。

## 起動入口と設定の追記（D1・D4、AWS 未接続）

2026-11-14、`ef7b9f6` の後続として追加した。読み取り監査の D1（起動入口）・D4（設定の受け渡し）のうち、運用構成の採用を伴わない部分を実装する。監査資料の実パスは `/private/tmp/slg-audit/SageFaraday/infra-save-api-gap.md`。AWS へ接続できる状態や、D1/D4 全体の解消を意味しない。

| 新規モジュール | 責務 |
| --- | --- |
| `config.mjs` / `.d.mts` | `readSaveServerConfig(environment)`。入力を検証して変更不可の設定を返す純粋関数。環境変数の書換え・取得・DNS・AWS 呼出しなし |
| `startup.ts` | `startSaveServer(config, createBackend, options?)`。設定を factory に渡して storage/getJwks を受け取り、JWT・HTTP を構築して listen。AWS SDK、メモリ保存、自動 backend 選択を import しない |
| `lifecycle.mjs` / `.d.mts` | listen の成功/失敗、SIGTERM/SIGINT、`stop()` / `closed`。新規接続を止め、処理中の要求を待ってから backend.close を一度呼ぶ |
| `runtime.mjs` / `.d.mts` | 設定読取、明示されたローカル backend module の読込、定型の開始/終了/失敗イベントと終了コード |
| `entry.ts` | runtime から start を呼ぶ実行入口。Node 向けにバンドルして実行する。直接ブラウザのビルドへ含めない |

### 必須設定と検証

下記8項目には既定値を用意しない。起動用 entry では backend module の指定も必須。値が欠けている、不正な形、環境が整合しない場合は listen する前に拒否する。例外・起動出力は `INVALID_CONFIGURATION: SAVE_API_HOST, ...` のように**定型コードと項目名だけ**を示し、受け取った値を表示しない。

| 環境変数 | 設定のプロパティ | 検証と出所 |
| --- | --- | --- |
| `SAVE_API_HOST` | `host` | 明示的な IPv4/IPv6 アドレス。ホスト名は DNS の挙動を含むため受け取らない。ローカル例は `127.0.0.1`。本番の bind 値は選んでいない |
| `SAVE_API_PORT` | `port` | 0〜65535 の整数の十進表記。0 はローカル試験でポートを自動割当する明示指定。未設定を0や80にしない |
| `SAVE_API_TABLE_NAME` | `tableName` | 3〜255文字の英数字・`_`・`-`・`.`。Terraform の `dynamodb_table_name` と照合する |
| `AWS_REGION` | `region` | region の文字列形式を検査。実在リージョンや実環境の到達性を問い合わせない |
| `COGNITO_ISSUER` | `issuer` | HTTPS の Cognito issuer、region と pool ID の region 部分が一致。中国リージョンの `.amazonaws.com.cn` も形を区別する。query・fragment・余分な path・別 region を拒否。pool ID は issuer の一部として受け取り、別の未検証値から作らない |
| `COGNITO_CLIENT_ID` | `clientId` | 英数字1〜128文字。`cognito_user_pool_client_id` / SSM と照合。secret を受け取る項目ではない |
| `SAVE_API_JWKS_PARAMETER` | `jwksParameterName` | `/.../jwks` の絶対 Parameter Store 名。現 Terraform の `<prefix>/cognito/jwks` を渡す。取得元の名前だけを指定し、取得・更新・キャッシュは実装しない |
| `SAVE_API_HEALTH_PATH` | `healthPath` | 既存サーバーが受け入れる `/api/[a-z0-9/_-]+`。保存 API を health で覆わないよう `/api/saves` とその配下を拒否。ALB の実際の値を渡す |
| `SAVE_API_BACKEND_MODULE` | entry の module path | 信頼するローカル `.mjs` ファイルの絶対パス。相対パス・公開 URL を拒否。`createBackend` の export が必要。任意の利用者入力から設定しない |

client ID が実 pool に属するか、テーブル・SSM prefix が同じ環境か、実 IAM が許可するかは、文字列の検証からは確定できない。デプロイ担当が設定の出所を揃えて照合する。

### 起動・終了と factory の契約

`createBackend(config, drivers)` は `{ storage, getJwks, close? }` を同期または非同期に返す。起動入口は factory を一度だけ呼ぶ。メモリ保存への fallback はなく、factory/module を省略して起動すると失敗する。ローカル確認はテストが MemorySaveStorage と生成した公開 JWKS を**明示的に注入**する。実行用の entry にテスト鍵やメモリ実装は含めない。

`drivers.createDynamoStorage(client)` は entry と同じモジュールの既存 DynamoSaveStorage を、検証済み `tableName` で作る。別バンドルの backend module が DynamoSaveStorage/SaveError まで再バンドルすると、entry の `instanceof SaveError` が別クラスを見て500/422を503として扱う。この生成関数を使い、SDK クライアントのポートだけを渡すことで型の同一性を保つ。SDK の import/生成は外部 factory の責務のままで、今回追加していない。

初期化・listen に失敗した場合も、返された backend の close があれば呼ぶ。ポート使用中は `ADDRESS_IN_USE`、他の listen 失敗は `LISTEN_FAILED`、module 読込失敗は `BACKEND_MODULE_FAILED`、factory の失敗や不正な戻り値は `BACKEND_INITIALIZATION_FAILED`。元の例外の message、スタック、ファイルパス、AWS エラーや資格情報は出力しない。factory が戻り値を返す前に作ったリソースの失敗時解放は、その factory 自身が担当する。

SIGTERM/SIGINT と `stop()` は Node の server.close で受付を止め、処理中の要求が終わってから backend.close を呼ぶ。同じシグナルの繰返しや stop の再呼出しは同じ停止処理を待つ。`process.exit()`、`closeAllConnections()`、処理の強制取消は呼ばない。正常なシグナル終了は Node が自然に終了する code 0、起動・停止の失敗は code 1。シグナルハンドラーは停止後に外す。`closed` で停止完了を待てる。

強制終了までの猶予時間や SDK/provider の処理期限は選んでいない。provider が完了しない処理を返せば停止も待ち続ける。常駐管理側の停止期限、SDK/provider の timeout/retry、リソースを解放する close の設計は接続担当と決める。ログは entry が `SAVE_API_STARTED`、`SAVE_API_STOPPED`、`STOP_FAILED` 等の定型イベントを stderr に出すだけで、収集先・保存期間・アクセス/業務ログは配線していない。

### 実行可能な entry の作成とローカル試験

既存 esbuild（Vite の依存）を使い、SDK を含まない Node 実行用 entry を作れる。これは手元で作る例で、配布経路・常駐方法の選択ではない。既存の `game/package.json` やフロントビルドを変更しない。

```sh
export PATH=/Users/Shogo/.local/share/fnm/node-versions/v24.22.1/installation/bin:$PATH
cd game
node --input-type=module <<'JS'
import { build } from 'esbuild';
await build({
  entryPoints: ['src/save-server/entry.ts'],
  outfile: '/private/tmp/slg-save-server-build/entry.mjs',
  platform: 'node', target: 'node24', format: 'esm', bundle: true,
});
JS
# 上表の必須環境変数を供給した上で、信頼する factory を明示する。
SAVE_API_BACKEND_MODULE=/absolute/path/to/backend.mjs \
  node /private/tmp/slg-save-server-build/entry.mjs
```

factory がまだ無いため、実 AWS 用の起動はこの変更だけではできない。ローカルの確認は以下のテストで行う。固定ポート・実 AWS・外部サービスは使わない。

```sh
npx vitest run tests/save-server-startup.test.ts
```

テスト内で entry をバンドルし、明示注入のメモリ保存/生成鍵で127.0.0.1:0を listen する。ネイティブ Node 子プロセスでも実行し、実 SIGTERM/SIGINT と処理中の要求の完了を試す。試験用の一時 module/配布物はテスト後に削除する。

### 実 SDK/SSM factory の接続例（未実装・未実行）

下記は必要な依存を別途追加した後の形を示すだけで、今回の実行用ファイルには含めない。SSM の更新/キャッシュ・SDK の retry/timeout 方針を採用した例ではない。

```ts
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

export function createBackend(config, { createDynamoStorage }) {
  const dynamo = new DynamoDBClient({ region: config.region });
  const ssm = new SSMClient({ region: config.region });
  return {
    storage: createDynamoStorage({
      getItem: input => dynamo.send(new GetItemCommand(input)),
      putItem: input => dynamo.send(new PutItemCommand(input)),
    }),
    getJwks: async () => {
      const result = await ssm.send(new GetParameterCommand({ Name: config.jwksParameterName }));
      if (!result.Parameter?.Value) throw new Error('JWKS_UNAVAILABLE');
      return JSON.parse(result.Parameter.Value);
    },
    close: () => { dynamo.destroy(); ssm.destroy(); },
  };
}
```

設定は上表から config を経由して渡され、request の Host/query/未検証 JWT は使わない。資格情報は実接続時の EC2 instance profile / デフォルト provider に任せる前提で、entry に静的 AWS key を渡す仕組みは追加していない。factory 自体も Node ESM と必要な依存を配布できる形にする必要がある。

### 実装しなかった選択と影響

| 未採用の選択 | 選択肢と影響 |
| --- | --- |
| SDK 依存の置き場 | 既存 package/lockfile に追加すると共有ファイルの変更とブラウザ側の依存管理が伴う。サーバーを別 package にするとビルド・lockfile・配布単位が増える。どちらも選ばず factory 契約のみ用意 |
| 配布 | 依存込み成果物を SSM/S3 等で渡す方式は版の固定・artifact 読取権限・配置/rollback が必要。イメージに runtime と成果物を含める方式はイメージ作成・更新運用が必要。NAT の無い EC2 で公開 npm registry を使う前提にしない |
| 80番と bind | Node 直接80番なら実行権限、local proxy を置くならその監視/設定、ターゲット port を変えるなら ALB target/attachment/SG をまとめて変更する必要がある。entry は入力された値だけで listen し、どの構成も選んでいない |
| 常駐・停止期限 | systemd 等の再起動・依存関係・起動順・猶予時間・rollback が必要。現 Python 仮サーバーの置換は別作業。entry は要求を待つ停止機構だけを提供 |
| token/鍵運用 | ID token 前提を維持。access token 採用なら claims/権限契約の変更が必要。SSM 更新主体・取得期限・キャッシュ・未知 kid・個別失効は別判断 |
| CORS・ログ収集 | 同一 origin の既存前提を維持。別 origin は client/server/CSP を一緒に設計する必要がある。stderr 定型イベントの収集・保存/監視は別判断 |

### 追記の検証結果

Node 24.22.1 で `npm run build && npm test` 成功。Vitest **18ファイル425件（この追記で44件追加）**、CLI **13件**が全件成功。追加試験は設定欠落/不正、明示 factory、メモリ保存の明示注入、鍵取得失敗による503と storage 未アクセス、port 競合、backend 解放、停止例外の秘匿、両シグナル、受付停止と処理中の要求の完了、実 entry の code 0/1、別 module の DynamoDB 破損500/未来422、起動ログ/例外の秘密値非出力を確認した。

今回も AWS/外部サービス接続、資格情報取得、Terraform、デプロイ、SDK 依存追加、実 client/SSM 取得、配布/常駐/80番変更、ゲーム本編への配線、Issue/PR 編集は行っていない。

## 停止中の本文受信期限の修正

`4134aa2` の独立監査で、認証済み PUT の本文を1バイトだけ送って待ったあと SIGTERM/SIGINT を受けると、Node の server.close が接続確認のタイマーを止め、既存の受信期限5秒が効かず停止も待ち続けることを確認した。修正前の回帰試験は7.5秒で失敗した。

HTTP 境界にリクエストごとの本文受信タイマーを追加し、既存の5秒という値を停止中も維持する。未完了の本文だけを400 INVALID_REQUEST・no-store・Connection: closeで終了し、本文受信済みの処理には適用しない。応答完了後の再送信を防ぎ、本文受信/要求や応答の終了でタイマーを解放する。停止猶予や SDK/provider の期限を新しく設定したものではない。

`npm run build && npm test` が成功。Vitest **18ファイル427件**（この修正で2件追加）、CLI **13件**が全件成功。回帰試験は実 HTTP の部分本文と SIGTERM→SIGINT で、5秒の期限による400、接続終了、backend.close の一度だけの実行を確認した。対になる試験では、本文を送り終えた正常な PUT がストレージ処理で5.2秒待っても切られず、200応答後に停止することを確認した。既存 `save-api/`、lifecycle の停止方式、依存・Terraform・本編は変更していない。

## 停止中の未完了ヘッダー受信の期限の修正

3f7c95c の独立監査で、接続直後・部分要求行・未完了ヘッダーのまま SIGTERM/SIGINT を受けると、Node の server.close が headersTimeout の確認タイマーを止めるため、停止が無期限に待たされることを確認した（修正前の回帰試験は7.3秒で失敗）。

HTTP 境界が、完全な要求ヘッダーをまだ受け取っていない接続（接続直後、部分要求行・部分ヘッダー、keep-alive 応答後）の経過時間を追跡する。`server.close` の開始後は 250ms 間隔で Node 公開 API の `closeIdleConnections()` を呼び、既存の5秒を超えた未完了の接続へ400 INVALID_REQUEST・no-store・Connection: close を返して閉じる（応答を読まない相手も1秒後に破棄）。要求ヘッダーが完全に届いた処理（本文待ち・認証・ストレージ処理中）には適用せず、従来どおり本文は要求単位の5秒タイマー、受信後の処理は完了まで待つ。停止猶予や provider の期限は新しく設定していない。保存処理には触れないため、切断で保存データや受信途中のデータは書かれない。

試験は接続直後・部分要求行・部分ヘッダー・keep-alive 待機・次要求の途中を、SIGTERM/SIGINT それぞれで7.3秒以内に停止完了・backend.close 一度だけとして確認する。

### 停止時の挙動の実測（`save-server-drain.test.ts`、Node 24.22.1）

先の完了報告の「keep-alive 後の次要求の途中は5秒期限で400」は誤りだった。keep-alive 応答後に次の要求を途中まで送って停止した場合、Node が `server.close` の中でその接続を即座に閉じ（3秒以内、5秒の期限よりかなり早い）、400 は返らず、保存の書き込みも起きない。400 で閉じるのは、接続直後・部分要求行・部分ヘッダーの接続が5秒を超えた場合である。固定した挙動:

- ヘッダーが途中で停止し、期限内（3秒後）に残りが届いた要求は通常どおり200で完了し、その後に停止が完了する。
- 停止前に完全に受信済みだった要求は、1本の接続に続けて送られた2件（パイプライン）でも両方が応答される。切断で途中の応答は切られない。
- 停止後に届く完全な PUT は、新規接続では受け付けられず、既存の待機中 keep-alive 接続では接続が閉じられるため、書き込みは起きない。
- 停止時に処理中だった PUT は、完了するまで backend.close を待たせ、書き込み1回・200応答で終わる。
- `server.close` が停止中にもう一度呼ばれても、2回目は Node のとおりエラーを返すだけで、停止処理・backend.close は一度のまま。
- 停止しない場合、通常の要求は200、ヘッダーが未完了の接続は約5秒で400になる。
