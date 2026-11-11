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

variable "cognito_domain_prefix" {
  description = "Cognito Hosted UI のドメインプレフィックス。null ならアカウント ID から自動生成"
  type        = string
  default     = null
}

variable "cognito_allow_self_signup" {
  description = "ユーザー自身のサインアップを許可するか。false なら管理者のみがユーザーを作成できる"
  type        = bool
  default     = true
}

variable "cognito_extra_callback_urls" {
  description = "CloudFront 以外に許可するログイン後のリダイレクト先（ローカル開発用など）"
  type        = list(string)
  default     = []
}

variable "cognito_extra_logout_urls" {
  description = "CloudFront 以外に許可するログアウト後のリダイレクト先"
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "アプリログ（CloudWatch Logs）とアクセスログ（S3）の保存日数"
  type        = number
  default     = 90
}

variable "content_security_policy" {
  description = "CloudFront で付ける Content-Security-Policy。null なら self と Cognito だけを許可する既定値"
  type        = string
  default     = null
}
