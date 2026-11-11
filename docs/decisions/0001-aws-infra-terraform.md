# 0001: AWS インフラを Terraform で管理し、CloudFront だけを公開する

決定日：2026-11-11

## 背景

EC2 / ALB / DynamoDB / S3 / CloudFront / CloudWatch / Cognito を使う最小構成の IaC が必要になった。
ユーザーが直接アクセスできるのは CloudFront だけにし、VPC 内の EC2・ALB には外部から到達できないようにする。

## 採用する方針

- IaC には Terraform を使う（`infra/`）。
- ALB は内部 ALB とし、CloudFront の VPC オリジンで接続する。
- EC2 はプライベートサブネットに置き、DynamoDB と S3 にはゲートウェイ VPC エンドポイントでアクセスする。

## 理由

- 必要なリソースはすべて Terraform の AWS プロバイダ（5.82 以降は VPC オリジンを含む）で扱え、CDK にする必要がない。
- VPC オリジンを使うと、ALB をインターネットに公開せずに CloudFront のオリジンにできる。

## 代替案

- AWS CDK：TypeScript などで書けるが、今回の構成では Terraform に対する利点が小さい。
- 公開 ALB とカスタムヘッダーによる制限：ALB がインターネットから見えてしまうため採用しない。
