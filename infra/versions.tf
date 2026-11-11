terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # aws_cloudfront_vpc_origin が使える 5.82 以降
      version = ">= 5.82, < 7.0"
    }
  }

  # TODO: state の保存先（S3 backend など）は未決定。決まるまではローカル state。
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
