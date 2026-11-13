# 保存サーバーの HTTP 境界と ID トークン検証（AWS 未接続）

[Issue #20](https://github.com/kame447/gmo-security-life-game/issues/20)（親 [#38](https://github.com/kame447/gmo-security-life-game/issues/38)）の接続準備。[保存契約](save-api.md)と[HTTP・DynamoDB アダプタ](save-api-http.md)を使い、別モジュール `game/src/save-server/` に HTTP と署名検証を追加した。

**実 AWS 未接続・未デプロイ・本編未配線。** SDK 依存、実クライアント、SSM 読取、実環境の JWKS 更新、ログイン UI、起動用エントリは追加していない。既存の `save-api/`、ゲーム本体、package.json・lockfile、Terraform は変更していない。Node 24.22.1、ローカルの生成鍵、注入した DynamoDB モックだけで検証した。

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

HTTP 本文・ヘッダーの待ち時間は Node の5秒設定（確認間隔1秒）を指定する。JWKS/ストレージ処理の期限、HTTP 応答後の処理の取消は実装していない。接続先は SDK/provider の期限も設定する必要がある。トークン・鍵・Authorization・保存内容をログに出す処理はない。

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

汎用の HTTP モジュール自体は Node で直接 import できる。全体の起動エントリの形は以下（**接続時に用意する例で、現在のリポジトリには追加していない**）。

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
6. **Node 向けに配布物を作る。** 既存フロントビルドとは別に、起動 entry を既存 esbuild（Vite の依存）等で `platform: 'node', target: 'node24', format: 'esm', bundle: true` にする。Node 組込みは external。SDK を外部化するなら対応する依存も配布する。起動は Node 24 の `node <server-entry.mjs>`。この手順のためのビルド script や entry は今回追加していない。
7. **EC2 の起動手順を用意する。** user_data の Python サーバーを止める置換手順、Node/配布物の導入、非 root での80番 listen を可能にする systemd 等の設定、再起動・停止・ロールバックを決める。ALB/SG の80番を維持するか変更するかは担当者の判断が必要。現在はその変更やデプロイをしていない。
8. **IAM・ネットワークと実到達を検証する。** 既存ロールの GetItem/PutItem、SSM prefix 読取は定義上足りる。テーブル・region・SSM prefix の実値と endpoint policy、実ロールの適用は未検証。ALB のヘルスチェック、CloudFront からの Authorization と no-store、他人の sub の隔離、条件競合・冪等再送、サイズ境界、スロット破損/未来版、障害・復元を実環境で確認する。PITR は任意履歴を返すアプリ API にはならない。

## 検証結果と限界

Node 24.22.1、既存キャッシュからの `npm ci --offline` で検証した。`npm run build` 成功、Vitest **17ファイル381件（今回追加58件）**、CLI **13件**がすべて成功。追加テストは JWT 35件、HTTP 結合23件。129KiB の本文が終わる前でも上限超過を413にすること、ちょうど128KiBの data を保存→読込→再保存できることも確認した。

ブラウザの `dist/` には `save-server`、`node:http`、`node:crypto`、サーバー固有の識別子が含まれないことを検索で確認した。実 AWS・外部認証サービスへの接続、認証情報取得、Terraform init/plan/apply、デプロイ、GUI/E2E、本編配線、Issue/PR 更新は実施していない。SDK の実クライアントとサーバー配布物の本番起動は、このローカル試験の成功から保証されない。
