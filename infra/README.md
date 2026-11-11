# infra

AWS 環境の Terraform（最小構成）。

## 構成

```
User ──HTTPS──> CloudFront ─┬─ /*      ─> S3（フロントエンド、OAC 経由のみ）
   │                        └─ /api/*  ─> VPC オリジン ─> 内部 ALB ─> EC2 ─> DynamoDB
   │                                      （プライベートサブネット、VPC エンドポイント経由）
   └──HTTPS──> Cognito（ユーザープール / Hosted UI）でログインし、トークンを /api/* に付けて送る

EC2 ─> インターフェースエンドポイント（SSM / CloudWatch Logs）
       ・Session Manager で接続、Parameter Store から Cognito の issuer / JWKS を読む
       ・/var/log/app/*.log を CloudWatch Logs へ送る
ALB / CloudFront のアクセスログ ─> S3（logs バケット）
CloudWatch アラーム（EC2 CPU / ステータスチェック、ALB 異常ホスト / 5xx）─> SNS
```

- インターネットに公開されるのは CloudFront のみ。
- ALB は `internal`。セキュリティグループで CloudFront のマネージドプレフィックスリストからの通信だけを許可する。
- EC2 は ALB からの通信だけを受け付ける。パブリック IP と NAT はなし。外向きは HTTPS で、VPC 内のエンドポイントと DynamoDB / S3 にだけ出られる。
- DynamoDB と S3 にはゲートウェイ VPC エンドポイント経由でアクセスする。
- S3 バケットは非公開で、HTTPS 以外のアクセスを拒否する。フロントエンドのバケットは CloudFront（OAC）からのみ読める。
- CloudFront は全レスポンスにセキュリティヘッダー（HSTS、CSP、X-Frame-Options など）を付ける。CSP は `content_security_policy` で上書きできる。
- 拡張子のないパス（`/` や `/play` など）は CloudFront Function で `/index.html` を返す（SPA を前提にした仮置き）。
- 認証は Cognito ユーザープール。フロントエンド用クライアントはシークレットなし（SRP / 認可コード + PKCE）。
  ログイン後のリダイレクト先は CloudFront のドメイン（`cognito_extra_callback_urls` で追加可）。
- バックエンドは Parameter Store（`<app_parameter_prefix>/cognito/*`）の issuer・client-id・JWKS でトークンを検証する。
  EC2 からインターネット上の JWKS は取れないため、apply 時に Terraform が取得して置く。

## 初回セットアップ

state は S3 に置く。そのバケットと CI 用のロールを `bootstrap/` で一度だけ作る。

```sh
cd infra/bootstrap
terraform init
terraform apply          # state_bucket と github_plan_role_arn が出力される

cd ..
cp backend.hcl.example backend.hcl   # bucket を state_bucket の値に書き換える
terraform init -backend-config=backend.hcl
```

- `terraform init` で作られる `.terraform.lock.hcl`（`infra/` と `infra/bootstrap/`）はコミットする。
  複数 OS で使うため `terraform providers lock -platform=darwin_arm64 -platform=darwin_amd64 -platform=linux_amd64` で揃える。
- `bootstrap/` の state はローカル（`infra/bootstrap/terraform.tfstate`）。コミットせず、なくさないように保管する。
- アカウントに GitHub の OIDC プロバイダが既にある場合は `-var create_github_oidc_provider=false` を付ける。
- CI で plan を動かすには、GitHub のリポジトリ変数に `AWS_PLAN_ROLE_ARN`（github_plan_role_arn）と `TF_STATE_BUCKET`（state_bucket）を設定する。設定するまで plan ジョブはスキップされる。

## 使い方

```sh
cd infra
terraform plan
terraform apply
```

- フロントエンドの配置: `aws s3 sync <build-dir> s3://$(terraform output -raw frontend_bucket)`
- フロントエンドに渡す認証設定: `terraform output` の `cognito_user_pool_id` / `cognito_user_pool_client_id` / `cognito_hosted_ui_domain`
- EC2 への接続: `aws ssm start-session --target $(terraform output -raw app_instance_id)`
- アプリログ: `aws logs tail $(terraform output -raw app_log_group) --follow`

## CI（.github/workflows/ci.yml）

- `terraform fmt -check` と `validate`（`infra/` と `infra/bootstrap/`）
- tflint（`.tflint.hcl`。AWS ルールセットを含む）
- trivy による設定スキャン。HIGH 以上を一覧に出し、CRITICAL があれば失敗する。受け入れた指摘は理由とともに `.trivyignore` に書く
- `terraform plan`（読み取り専用ロール、ロックなし）。同じリポジトリからの pull request で、上記のリポジトリ変数があるときだけ動く

## 費用の目安になるもの

- インターフェースエンドポイント 4 つ（ssm / ssmmessages / ec2messages / logs）。費用を抑えるため 1 サブネットにだけ置いている

## 未決定事項（仮置き）

- EC2 の台数と冗長化（現在は 1 台、Auto Scaling なし。インターフェースエンドポイントも 1 AZ のみ）
- アプリのデプロイ方法（SSM Run Command などで可能になった。EC2 の user_data は仮のヘルスチェック用サーバー）
- DynamoDB のキー設計（`pk` / `sk` で仮置き）
- 独自ドメインと証明書、WAF
- CloudFront と ALB 間の通信（現在は HTTP。AWS ネットワーク内に閉じている）
- 認証仕様（サインイン方式、属性、MFA の必須化、セルフサインアップ可否、トークン有効期限）。現在はメール + 任意 TOTP で仮置き
- Cognito のメール送信（現在は Cognito 既定で送信数に上限あり。本番は SES が必要）
- フロントエンドが SPA かどうか（CloudFront Function と CSP の既定値は SPA を前提にしている）
- 環境の分け方（dev / prod）。backend の `key` と `environment` 変数で分ける想定だが未確定
- ログの保存期間（`log_retention_days`、既定 90 日）
