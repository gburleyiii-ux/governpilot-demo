variable "project_name" {
  description = "Short name used for resource naming."
  type        = string
  default     = "sentinelops-ai"
}

variable "environment" {
  description = "Deployment environment label."
  type        = string
  default     = "pilot"
}

variable "aws_region" {
  description = "AWS GovCloud region for the deployment."
  type        = string
  default     = "us-gov-west-1"
}

variable "vpc_cidr" {
  description = "CIDR block for the isolated SentinelOps VPC."
  type        = string
  default     = "10.42.0.0/20"
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDR blocks for ECS tasks and VPC endpoints."
  type        = list(string)
  default     = ["10.42.1.0/24", "10.42.2.0/24"]
}

variable "allowed_internal_cidrs" {
  description = "Internal CIDR blocks allowed to reach the private SentinelOps load balancer."
  type        = list(string)
  default     = ["10.0.0.0/8"]
}

variable "alb_certificate_arn" {
  description = "Optional ACM certificate ARN for the internal ALB HTTPS listener. When empty, the module creates an HTTP pilot listener only."
  type        = string
  default     = ""
}

variable "container_image" {
  description = "ECR image URI for the built SentinelOps single-service container."
  type        = string
  default     = "REPLACE_WITH_ACCOUNT_ID.dkr.ecr.us-gov-west-1.amazonaws.com/sentinelops-ai:latest"
}

variable "container_port" {
  description = "Application port exposed by the SentinelOps container."
  type        = number
  default     = 4175
}

variable "task_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 512
}

variable "task_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 1024
}

variable "desired_count" {
  description = "Number of private ECS tasks to run for the pilot."
  type        = number
  default     = 1
}

variable "evidence_retention_days" {
  description = "Retention period for evidence packet objects and application logs."
  type        = number
  default     = 365
}

variable "tags" {
  description = "Additional resource tags."
  type        = map(string)
  default     = {}
}

variable "auth_mode" {
  description = "Aegis C1: ECS must use jwt or oidc. local-dev is refused on this production-like task def."
  type        = string
  default     = "oidc"

  validation {
    condition     = contains(["jwt", "oidc"], var.auth_mode)
    error_message = "auth_mode must be jwt or oidc for GovCloud pilots (Aegis C1)."
  }
}

variable "auth_issuer" {
  description = "OIDC issuer URL required when auth_mode=oidc."
  type        = string
  default     = ""
}

variable "auth_audience" {
  description = "OIDC audience required when auth_mode=oidc."
  type        = string
  default     = ""
}

variable "auth_jwks_url" {
  description = "HTTPS JWKS URL required when auth_mode=oidc."
  type        = string
  default     = ""
}
