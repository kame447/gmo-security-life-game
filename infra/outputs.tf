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
