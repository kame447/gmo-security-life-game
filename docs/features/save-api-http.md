# セーブAPIのHTTP・DynamoDBアダプタ（未接続）

[Issue #20](https://github.com/kame447/gmo-security-life-game/issues/20)（親 [#38](https://github.com/kame447/gmo-security-life-game/issues/38)）の追加実装。[既存の契約](save-api.md)を変えず、`SaveRemote` と `SaveStorage` に実装を追加する。本編への配線、HTTPサーバー、CognitoのJWT検証、AWSへの接続・デプロイは行っていない。

`game/src/save-api/http.ts` と `dynamodb.ts` は直接importする。既存のbarrel、ゲームDTO、localStorageの保存処理、依存パッケージとTerraformは変更しない。DynamoDBモジュールはサーバー専用で、ブラウザの入口からimportしない。

## HTTPクライアント

```ts
import { HttpSaveRemote } from '../../game/src/save-api/http';

const remote = new HttpSaveRemote({
  getToken: async () => currentSessionIdToken(), // IDトークン本体。未ログインならnull。
  timeoutMs: 5000,
});
// 既存SaveRepositoryにremoteを渡す。ゲーム本体には未配線。
```

呼出先は同一originの `GET /api/saves/{slotId}` と `PUT /api/saves/{slotId}` に固定する。ユーザーIDをURLや権限指定に追加しない。各呼出しで引数の関数から最新のトークンを取得し、`Authorization: Bearer ...` を付ける。トークンをキャッシュ・保存・ログ出力せず、JWTのデコードや検証も行わない。サーバーで署名、issuer、audience、`token_use=id`、期限等を検証する必要がある。

トークンがない場合とBearer値として不正な場合は、fetchを呼ばず `{ status: 401, body: { error: { code: 'UNAUTHENTICATED' } } }` を返す。取得関数の例外は内容を公開せず通信エラーにする。ログイン主体の切替時に既存リポジトリを作り直す要件は変わらない。

リクエストに `Cache-Control: no-store` とfetchの `cache: 'no-store'` を設定する。Cookieは送らず、リダイレクトと別originへの送信を許可しない。**サーバー応答の `Cache-Control: no-store` はHTTPサーバー側で別途設定が必要。** 既存 `infra/frontend.tf` の `/api/*` は `Managed-CachingDisabled` と `Managed-AllViewerExceptHostHeader` を使用しているが、この追加実装で実環境の設定を検証したわけではない。

| 状況 | アダプタの結果 |
| --- | --- |
| 不正なスロット・送信JSON値 | 既存の400 `INVALID_REQUEST` |
| 送信データの未来版 | 422 `UNSUPPORTED_VERSION` |
| 送信サイズ超過 | 413 `TOO_LARGE`。fetch前に拒否 |
| JSON応答 | 実際のHTTPステータスと解析済み本文をそのまま返す |
| 取得・通信・本文ストリームの失敗 | `SaveHttpError`、`problem: 'NETWORK'` |
| 応答JSON構文エラー・不正なUTF-8・本文なし | `SaveHttpError`、`problem: 'INVALID_RESPONSE'` |
| 受信サイズ超過 | `SaveHttpError`、`problem: 'TOO_LARGE'` |
| 待ち時間超過 | `SaveHttpError`、`problem: 'TIMEOUT'`。AbortSignalとストリーム取消を要求 |

成功APIの契約は引き続き **200**。輸送層は201などを200へ読み替えず、`SaveRepository` が従来どおり成功封筒、エラーコードとステータスの対応、スロット・リビジョン・内容を検証する。HTTPクライアントは不正な受信JSONを400に変換しない。**不正なリクエストJSONを400にするサーバーのHTTP境界は未実装。**

既存 `SaveRepository` はポートが投げた例外を一律 `NETWORK` と扱う。このため上記 `SaveHttpError.problem` の詳細は直接利用時に取得できるが、現状のリポジトリ経由では `NETWORK` になる。リポジトリ自身の待ち時間上限が先に来た場合は従来の `TIMEOUT`。今回この既存の例外変換は変更していない。どちらも未送信のデータ・キーを保持する。

保存本文はトークン取得前に検証してコピーする。`data` のUTF-8 JSONは128KiB以下、送信リクエスト全体と受信HTTP本文は129KiB以下。受信はストリームのバイト数を加算し、上限を超えたらJSON解析前に中止する。Content-Lengthが過小・欠落・圧縮後のサイズであっても実際に受け取る本文を制限する。ちょうど128KiBの `data` は封筒・`{ save: ... }` の余地を含めて往復できる。

待ち時間上限はトークン取得から本文の受信完了までを対象とする。fetchが取消を無視しても呼出しは期限で終了し、遅れて得たトークンで送信しない。取消はサーバーの保存取消を意味しない。自動リトライは行わず、`SaveRepository.sync()` が同じ冪等キー・期待リビジョン・完全スナップショットで明示的に再送する。

## DynamoDBストレージ

`DynamoSaveStorage` はGetItemとPutItemだけのインターフェースを受け取る。実SDKのパッケージ・クライアント・リージョン・テーブル名はサーバー側で用意する。次は将来の接続例であり、SDKは本リポジトリに追加していない。

```ts
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoSaveStorage } from '../../game/src/save-api/dynamodb';

const sdk = new DynamoDBClient({ region });
const storage = new DynamoSaveStorage({
  getItem: input => sdk.send(new GetItemCommand(input)),
  putItem: input => sdk.send(new PutItemCommand(input)),
}, tableName);
// 既存SaveServiceにstorageを渡す。HTTPサーバーは別途必要。
```

`infra/dynamodb.tf` の文字列 `pk` / `sk` とPITR・暗号化の有効化を読み合わせた。主キーは既存 `authorize()` の `USER#<encoded sub>` / `SAVE#<slotId>`。項目を次のスカラー属性で一括保存する。保存形式の採用はまだ本番運用の決定ではない。

| 属性 | DynamoDB型 | 内容 |
| --- | --- | --- |
| `pk`, `sk`, `ownerSub` | S | 認証済み主体とスロット |
| `revision` | N | CAS条件に使う確定リビジョン |
| `saveJson` | S | JSON文字列の完全なSaveEnvelope |
| `idempotencyKey` | S | 直近の書込キー |
| `expectedRevision` | N | 直近書込の期待リビジョン |

読込は必ず `ConsistentRead: true`。新規は `attribute_not_exists(pk)`、更新は数値 `revision = :expected AND ownerSub = :owner` の条件付きPutItemを1回行い、封筒と冪等性メタデータを原子的に置き換える。属性名は式の別名を使う。条件不成立だけを `false` に変換し、スロットリング・権限・通信エラー等は例外として上位に渡す。`SaveService` が競合後に強整合で再読込し、同じ書込なら同じ成功、古い書込なら409を返す。

データ・封筒の上限に加え、属性名と文字列のUTF-8バイト数、数値の保守的な上界を足して項目全体が400KiB以内であることを確認する。文字列をHTTP JSONへエスケープした後のサイズとは区別する。読込は保存JSONの解析前にも129KiBを確認し、所有者・キー・封筒・重複リビジョン・冪等性メタデータの不整合や未来版を拒否して上書きを防ぐ。

読込時の破損は直接利用時に `SaveError('CORRUPT_SAVE')`、未来版は `UNSUPPORTED_VERSION`。既存 `SaveService` はストレージ例外を503 `UNAVAILABLE` にまとめるため、HTTPへ区別して返すには将来のサーバー境界でエラー変換を決める必要がある。破損項目を「未作成」に読み替えない。

PITRの有効化はTerraformの宣言を確認しただけで、AWS上での状態確認・復元試験はしていない。利用者が保存履歴を選んで戻す機能にはならない。冪等性は既存契約どおり直近の1件だけで、長期保持・削除・再作成の仕様は未決定。

GetItemの強整合指定と条件付きPutItemはそれぞれ [AWS GetItem](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_GetItem.html)、[AWS PutItem](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_PutItem.html) の仕様、項目上限は [AWS Constraints](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html) に照合した。

## 判断・検証・後続作業

重要な判断は、SDK依存をサーバーの注入箇所に閉じること、同一項目に封筒と冪等性情報を保存すること、通信失敗時に自動再送やリビジョン変更を行わないこと。既存契約を保ち、未接続のブラウザbundleへAWSコードを混ぜないため。判断記録の採番が未決定なので、この文書に理由を記す。

新規テストは `game/tests/save-api-http.test.ts` と `game/tests/save-api-dynamodb.test.ts`。fetchとSDKの小さなモックを使い、Node環境で検証する。HTTP成功・APIエラー・通信/構文/UTF-8/サイズ/タイムアウト、キャッシュ防止・トークン不在、128KiB境界、応答喪失後の同一PUT、条件付き書込・強整合読込・競合・主体分離・破損保護を対象とする。

2026-11-14、Node 24.22.1で `npm ci`、`npm run build`、`npm test` が成功。実出力はVitest **15ファイル・323件成功**（新規2ファイル・80件）、既存CLI **13件成功・失敗0件**。型検査とViteビルドを含む。新規5ファイルのScope Guardは重複なし。ただし内部のgit fetchが失敗したため、手元のremote refsによる判定。既存の追跡ファイルに差分はない。セルフレビューでブロッキング指摘なし。独立した他エージェントによるレビューは未実施。

後続作業は、HTTPサーバーとCognito検証、サーバー依存の導入とSDK配線、既存ストレージ例外のHTTP変換、応答キャッシュ禁止・CORS・レート/受信サイズ制限、ゲームへの接続と競合/認証/永続化失敗のUI、実AWSでの権限・競合・障害・PITR復元試験。配置先・ログ/監視方式と既存の未合意値も決める必要がある。

AWS認証情報の取得、AWS API呼出し、Terraform plan/apply、デプロイ、GUI/E2Eは実施しない。今回の実装はAWS未接続・本編未配線のまま。
