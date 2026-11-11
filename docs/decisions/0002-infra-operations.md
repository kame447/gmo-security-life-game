# 0002: NAT なしのまま、運用・認証・ログを VPC エンドポイントと Parameter Store で賄う

決定日：2026-11-11

関連：[0001](0001-aws-infra-terraform.md)（EC2 をプライベートサブネットに置き、NAT を持たない構成）

## 背景

0001 の構成では EC2 からインターネットに出られないため、次のことができなかった。

- Session Manager での接続や、アプリのデプロイ
- CloudWatch Logs へのログ送信
- Cognito の JWKS（JWT の署名検証用の公開鍵）の取得

あわせて、Terraform の state がローカルにあり、CI でも `validate` しか実行していなかった。

## 採用する方針

- SSM（ssm / ssmmessages / ec2messages）と CloudWatch Logs のインターフェースエンドポイントを置く。費用を抑えるため 1 サブネットのみ。
- EC2 の外向き通信は VPC 内と DynamoDB / S3 のプレフィックスリスト宛ての HTTPS に限る。
- Cognito の issuer・client-id・JWKS は apply 時に Terraform が取得し、Parameter Store に置く。バックエンドはそこから読む。
- state は S3 backend（`use_lockfile` によるロック）に置く。バケットと CI 用の読み取り専用 OIDC ロールは `infra/bootstrap/` で作る。
- CI に tflint と trivy を加え、AWS 側の準備が済んでいれば pull request で `terraform plan` を実行する。

## 理由

- NAT Gateway を置けばすべて解決するが、EC2 がインターネットに出られるようになり、0001 の「外部と直接通信しない」方針から外れる。
- Cognito ユーザープールの署名鍵は自動ではローテーションされないため、apply 時点の JWKS を配布すれば検証できる。

## 代替案

- NAT Gateway：構成は単純になるが、EC2 からインターネットへ出られるようになる。
- JWKS をアプリのビルドに埋め込む：アプリとインフラのデプロイが結び付くため採用しない。
- state の DynamoDB ロック：Terraform 1.10 以降は S3 だけでロックできるため不要。

## 今後見直す条件

- Cognito の署名鍵を入れ替えた場合は、`terraform apply` で JWKS を更新する必要がある。
- EC2 を複数 AZ にする場合は、インターフェースエンドポイントも複数サブネットに置く。
