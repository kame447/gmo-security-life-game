terraform {
  # S3 backend のネイティブロック（use_lockfile）が使える 1.10 以降
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # aws_cloudfront_vpc_origin が使える 5.82 以降
      version = ">= 5.82, < 7.0"
    }
    http = {
      source  = "hashicorp/http"
      version = ">= 3.4, < 4.0"
    }
  }

  # state は S3 に置く。バケット名などは backend.hcl で渡す（README 参照）
  # バケット自体は infra/bootstrap で作成する
  backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
