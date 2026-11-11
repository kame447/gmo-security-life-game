# Architecture

状態：一部記入（インフラ構成のみ。アプリケーションの構成は未記入）

## 全体構成

### インフラ（PoC）

AWS 上に Terraform で構築する。詳細と使い方は [infra/README.md](../infra/README.md)、判断の経緯は [0001](decisions/0001-aws-infra-terraform.md) と [0002](decisions/0002-infra-operations.md) を参照。

- 入口は CloudFront のみ。静的ファイルは S3、`/api/*` は内部 ALB 経由で EC2 に送る。
- データは DynamoDB。認証は Cognito ユーザープール。
- EC2 はプライベートサブネットに置き、NAT なしで VPC エンドポイント経由で AWS サービスを使う。

### アプリケーション

未記入。実装言語は TypeScript の予定（Issue #7）だが、描画エンジンやフロントエンド・バックエンドの構成は未決定。

## モジュールの責務

## データと状態の管理

## 依存関係とインターフェース

## 検証方針

- インフラ：CI で `terraform fmt` / `validate`、tflint、trivy による設定スキャン、（設定済みなら）`terraform plan` を実行する。
- アプリケーション：未記入。
