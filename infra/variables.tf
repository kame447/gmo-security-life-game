variable "project" {
  description = "リソース名の接頭辞"
  type        = string
  default     = "security-life-game"
}

variable "environment" {
  description = "環境名（dev / prod など）"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "AWS リージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

variable "api_path_pattern" {
  description = "CloudFront から ALB（EC2）へ転送するパス"
  type        = string
  default     = "/api/*"
}

variable "health_check_path" {
  type    = string
  default = "/api/health"
}

variable "alarm_email" {
  description = "CloudWatch アラームの通知先。空なら通知先なし"
  type        = string
  default     = ""
}
