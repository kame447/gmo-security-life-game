# infra

AWS 環境の Terraform（最小構成）。

## 構成

```
User ──HTTPS──> CloudFront ─┬─ /*      ─> S3（フロントエンド、OAC 経由のみ）
                            └─ /api/*  ─> VPC オリジン ─> 内部 ALB ─> EC2 ─> DynamoDB
                                          （プライベートサブネット、VPC エンドポイント経由）
CloudWatch アラーム（EC2 CPU / ステータスチェック、ALB 異常ホスト / 5xx）─> SNS
```

- インターネットに公開されるのは CloudFront のみ。
- ALB は `internal`。セキュリティグループで CloudFront のマネージドプレフィックスリストからの通信だけを許可する。
- EC2 は ALB からの通信だけを受け付ける。パブリック IP と NAT はなし。
- DynamoDB と S3 にはゲートウェイ VPC エンドポイント経由でアクセスする。
- S3 バケットは非公開で、CloudFront（OAC）からのみ読める。

## 使い方

```sh
cd infra
terraform init
terraform plan
terraform apply
```

フロントエンドの配置: `aws s3 sync <build-dir> s3://$(terraform output -raw frontend_bucket)`

## 未決定事項（仮置き）

- state の保存先（現在はローカル）
- EC2 の台数と冗長化（現在は 1 台、Auto Scaling なし）
- アプリのデプロイ方法（EC2 の user_data は仮のヘルスチェック用サーバー）
- EC2 の運用アクセス（SSM 用の VPC エンドポイントはまだない）
- DynamoDB のキー設計（`pk` / `sk` で仮置き）
- 独自ドメインと証明書、WAF
- CloudFront と ALB 間の通信（現在は HTTP。AWS ネットワーク内に閉じている）
