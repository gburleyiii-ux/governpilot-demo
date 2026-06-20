# SentinelOps AI GovCloud Terraform Skeleton

This module is a reviewable AWS GovCloud deployment skeleton for the SentinelOps AI proof-of-work. It is intentionally conservative: private subnets, no public task IPs, encrypted storage, VPC endpoints for AWS service access, internal load balancing, immutable ECR tags, and least-privilege task policies for the pilot data plane.

## What It Provisions

- Isolated VPC with private subnets
- Gateway S3/DynamoDB endpoints and interface endpoints for ECR, CloudWatch Logs, Secrets Manager, SSM, and ECS Exec support services
- Internal Application Load Balancer with `/api/health` target-group health checks
- ECS Fargate cluster, task definition, and service for the single-service SentinelOps container
- KMS key with rotation for logs, evidence storage, DynamoDB, and secrets
- S3 evidence bucket with versioning, public access block, KMS encryption, and lifecycle retention
- DynamoDB approval ledger table with point-in-time recovery and KMS encryption
- ECR repository with immutable tags and scan-on-push
- Secrets Manager placeholder for model gateway credentials
- ECS task environment variables for the `aws-s3-dynamodb` SentinelOps storage adapter

## Pilot Defaults

- Region: `us-gov-west-1`
- Listener: internal HTTP unless `alb_certificate_arn` is provided
- Agent mode: `deterministic-local`
- Desired task count: `1`
- Evidence/log retention: `365` days
- Storage adapter: `aws-s3-dynamodb`

## Usage

```bash
cd infra/terraform/govcloud
terraform init
terraform plan \
  -var='container_image=<account>.dkr.ecr.us-gov-west-1.amazonaws.com/sentinelops-ai:<tag>' \
  -var='allowed_internal_cidrs=["10.0.0.0/8"]'
```

For an HTTPS internal listener, pass an ACM certificate ARN:

```bash
terraform plan \
  -var='alb_certificate_arn=arn:aws-us-gov:acm:us-gov-west-1:<account>:certificate/<id>'
```

## Security Notes

- Do not store OpenAI, Bedrock, or gateway API keys in Terraform variables or state.
- Populate `aws_secretsmanager_secret.model_gateway` out of band after deployment.
- Keep the pilot on `deterministic-local` mode until model gateway routing and egress controls have been reviewed.
- Keep local JSON mode for workstation demos; use the DynamoDB/S3 adapter for GovCloud pilots.
- The module sets `SENTINELOPS_STORAGE_ADAPTER=aws` and points SentinelOps at the provisioned S3 bucket and DynamoDB ledger.
- Restrict `allowed_internal_cidrs` to VPN, Direct Connect, or transit-gateway-attached enterprise networks.
