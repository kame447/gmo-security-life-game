output "cloudfront_domain_name" {
  description = "ユーザーがアクセスする URL のドメイン"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.main.id
}

output "frontend_bucket" {
  description = "フロントエンドのビルド成果物をアップロードするバケット"
  value       = aws_s3_bucket.frontend.bucket
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.main.name
}

output "alarm_topic_arn" {
  value = aws_sns_topic.alarms.arn
}

output "cognito_user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "cognito_user_pool_client_id" {
  description = "フロントエンドに埋め込むクライアント ID（シークレットなし）"
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_issuer" {
  description = "バックエンドで JWT を検証するときの issuer"
  value       = local.cognito_issuer
}

output "cognito_hosted_ui_domain" {
  value = local.cognito_hosted_ui
}

output "app_parameter_prefix" {
  description = "アプリ設定（Cognito の issuer / JWKS など）を置いた Parameter Store のパス"
  value       = local.parameter_prefix
}

output "app_instance_id" {
  description = "Session Manager で接続するときのインスタンス ID"
  value       = aws_instance.app.id
}

output "app_log_group" {
  value = aws_cloudwatch_log_group.app.name
}

output "logs_bucket" {
  description = "ALB / CloudFront のアクセスログの保存先"
  value       = aws_s3_bucket.logs.bucket
}
