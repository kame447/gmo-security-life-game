# infra/ 本体より先に一度だけ apply する土台
# - Terraform state を置く S3 バケット
# - GitHub Actions から terraform plan を実行するための OIDC ロール（読み取り専用）
# この構成自体の state はローカルに置く（infra/bootstrap/terraform.tfstate。コミットしない）

terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.82, < 7.0"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}

variable "project" {
  description = "リソース名の接頭辞"
  type        = string
  default     = "security-life-game"
}

variable "region" {
  description = "AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "github_repository" {
  description = "plan を実行する GitHub リポジトリ（owner/name）"
  type        = string
  default     = "kame447/gmo-security-life-game"
}

variable "create_github_oidc_provider" {
  description = "GitHub の OIDC プロバイダを作るか。アカウントに既にある場合は false"
  type        = bool
  default     = true
}

data "aws_caller_identity" "current" {}

# --- state バケット ---

resource "aws_s3_bucket" "tfstate" {
  bucket_prefix = "${var.project}-tfstate-"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.tfstate.arn, "${aws_s3_bucket.tfstate.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })

  depends_on = [aws_s3_bucket_public_access_block.tfstate]
}

# --- GitHub Actions 用の plan ロール ---

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  github_oidc_provider_arn = (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
  )
}

resource "aws_iam_role" "github_plan" {
  name = "${var.project}-github-plan"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.github_oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        # このリポジトリの pull request と main ブランチからだけ引き受けられる
        StringLike = {
          "token.actions.githubusercontent.com:sub" = [
            "repo:${var.github_repository}:pull_request",
            "repo:${var.github_repository}:ref:refs/heads/main",
          ]
        }
      }
    }]
  })
}

# plan はリソースの読み取りと state の読み取りだけを行う（-lock=false で実行する）
resource "aws_iam_role_policy_attachment" "github_plan_readonly" {
  role       = aws_iam_role.github_plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

output "state_bucket" {
  description = "infra/backend.hcl の bucket に設定する値"
  value       = aws_s3_bucket.tfstate.bucket
}

output "github_plan_role_arn" {
  description = "GitHub リポジトリ変数 AWS_PLAN_ROLE_ARN に設定する値"
  value       = aws_iam_role.github_plan.arn
}
