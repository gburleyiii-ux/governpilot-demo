output "cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.sentinelops.name
}

output "service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.app.name
}

output "internal_load_balancer_dns_name" {
  description = "Internal ALB DNS name for private access."
  value       = aws_lb.internal.dns_name
}

output "evidence_bucket_name" {
  description = "Encrypted S3 bucket for audit evidence exports."
  value       = aws_s3_bucket.evidence.id
}

output "approval_ledger_table_name" {
  description = "DynamoDB table intended for signed approval records."
  value       = aws_dynamodb_table.approval_ledger.name
}

output "ecr_repository_url" {
  description = "ECR repository URL for SentinelOps images."
  value       = aws_ecr_repository.app.repository_url
}

output "kms_key_alias" {
  description = "KMS alias used by SentinelOps pilot storage."
  value       = aws_kms_alias.sentinelops.name
}
