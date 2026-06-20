data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  common_tags = merge(
    {
      Application     = "SentinelOps AI"
      Environment     = var.environment
      ManagedBy       = "Terraform"
      DataSensitivity = "No classified data in pilot"
    },
    var.tags,
  )

  interface_endpoint_services = toset([
    "ecr.api",
    "ecr.dkr",
    "logs",
    "secretsmanager",
    "ssm",
    "ssmmessages",
  ])
}

resource "aws_kms_key" "sentinelops" {
  description             = "SentinelOps AI pilot encryption key"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_alias" "sentinelops" {
  name          = "alias/${local.name_prefix}"
  target_key_id = aws_kms_key.sentinelops.key_id
}

resource "aws_vpc" "sentinelops" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_subnet" "private" {
  count = length(var.private_subnet_cidrs)

  vpc_id            = aws_vpc.sentinelops.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available.names[count.index]
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.sentinelops.id
}

resource "aws_route_table_association" "private" {
  count = length(aws_subnet.private)

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "task" {
  name        = "${local.name_prefix}-task"
  description = "SentinelOps private ECS task traffic"
  vpc_id      = aws_vpc.sentinelops.id

  ingress {
    description     = "Application traffic from internal ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "HTTPS to private AWS service endpoints"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
}

resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb"
  description = "Internal ALB access for SentinelOps"
  vpc_id      = aws_vpc.sentinelops.id

  ingress {
    description = "Internal HTTP pilot access"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = var.allowed_internal_cidrs
  }

  ingress {
    description = "Internal HTTPS access when certificate is configured"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = var.allowed_internal_cidrs
  }

  egress {
    description = "Application traffic to SentinelOps tasks"
    from_port   = var.container_port
    to_port     = var.container_port
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }
}

resource "aws_security_group" "endpoints" {
  name        = "${local.name_prefix}-endpoints"
  description = "Interface endpoint ingress from SentinelOps tasks"
  vpc_id      = aws_vpc.sentinelops.id

  ingress {
    description     = "HTTPS from SentinelOps tasks"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    security_groups = [aws_security_group.task.id]
  }
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.sentinelops.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
}

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.sentinelops.id
  service_name      = "com.amazonaws.${var.aws_region}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id]
}

resource "aws_vpc_endpoint" "interface" {
  for_each = local.interface_endpoint_services

  vpc_id              = aws_vpc.sentinelops.id
  service_name        = "com.amazonaws.${var.aws_region}.${each.key}"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.endpoints.id]
  private_dns_enabled = true
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/sentinelops/${var.environment}/app"
  retention_in_days = var.evidence_retention_days
  kms_key_id        = aws_kms_key.sentinelops.arn
}

resource "aws_ecr_repository" "app" {
  name                 = var.project_name
  image_tag_mutability = "IMMUTABLE"

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.sentinelops.arn
  }

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_lb" "internal" {
  name               = substr("${local.name_prefix}-internal", 0, 32)
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.private[*].id
}

resource "aws_lb_target_group" "app" {
  name        = substr("${local.name_prefix}-app", 0, 32)
  port        = var.container_port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.sentinelops.id

  health_check {
    enabled             = true
    path                = "/api/health"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    matcher             = "200"
  }
}

resource "aws_lb_listener" "http" {
  count = var.alb_certificate_arn == "" ? 1 : 0

  load_balancer_arn = aws_lb.internal.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_lb_listener" "https" {
  count = var.alb_certificate_arn == "" ? 0 : 1

  load_balancer_arn = aws_lb.internal.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = var.alb_certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

resource "aws_s3_bucket" "evidence" {
  bucket_prefix = "${local.name_prefix}-evidence-"
}

resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.sentinelops.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    id     = "retain-evidence"
    status = "Enabled"

    filter {
      prefix = ""
    }

    noncurrent_version_expiration {
      noncurrent_days = var.evidence_retention_days
    }
  }
}

resource "aws_dynamodb_table" "approval_ledger" {
  name         = "${local.name_prefix}-approval-ledger"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "runId"
  range_key    = "decidedAt"

  attribute {
    name = "runId"
    type = "S"
  }

  attribute {
    name = "decidedAt"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.sentinelops.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}

resource "aws_secretsmanager_secret" "model_gateway" {
  name        = "${local.name_prefix}/model-gateway"
  description = "Model gateway credentials placeholder. Store live credentials outside Terraform state."
  kms_key_id  = aws_kms_key.sentinelops.arn
}

resource "aws_ecs_cluster" "sentinelops" {
  name = local.name_prefix

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_iam_role" "task_execution" {
  name = "${local.name_prefix}-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws-us-gov:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "task" {
  name = "${local.name_prefix}-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "task" {
  name = "${local.name_prefix}-task"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "WriteAuditEvidence"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.evidence.arn,
          "${aws_s3_bucket.evidence.arn}/*"
        ]
      },
      {
        Sid    = "ApprovalLedger"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:Query",
          "dynamodb:UpdateItem"
        ]
        Resource = aws_dynamodb_table.approval_ledger.arn
      },
      {
        Sid    = "ReadModelGatewaySecret"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.model_gateway.arn
      },
      {
        Sid    = "UseSentinelOpsKey"
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:Encrypt",
          "kms:GenerateDataKey"
        ]
        Resource = aws_kms_key.sentinelops.arn
      }
    ]
  })
}

resource "aws_ecs_task_definition" "app" {
  family                   = local.name_prefix
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.task_cpu
  memory                   = var.task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  volume {
    name = "state-data"
  }

  container_definitions = jsonencode([
    {
      name      = "sentinelops-api"
      image     = var.container_image
      essential = true
      portMappings = [
        {
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        }
      ]
      mountPoints = [
        {
          sourceVolume  = "state-data"
          containerPath = "/app/data"
          readOnly      = false
        }
      ]
      environment = [
        {
          name  = "NODE_ENV"
          value = "production"
        },
        {
          name  = "SENTINELOPS_API_HOST"
          value = "0.0.0.0"
        },
        {
          name  = "SENTINELOPS_API_PORT"
          value = tostring(var.container_port)
        },
        {
          name  = "SENTINELOPS_AGENT_MODE"
          value = "deterministic-local"
        },
        {
          name  = "SENTINELOPS_STORAGE_ADAPTER"
          value = "aws"
        },
        {
          name  = "SENTINELOPS_AWS_REGION"
          value = var.aws_region
        },
        {
          name  = "SENTINELOPS_STATE_BUCKET"
          value = aws_s3_bucket.evidence.id
        },
        {
          name  = "SENTINELOPS_STATE_KEY"
          value = "state/sentinelops-state.json"
        },
        {
          name  = "SENTINELOPS_EVIDENCE_PREFIX"
          value = "evidence"
        },
        {
          name  = "SENTINELOPS_APPROVAL_LEDGER_TABLE"
          value = aws_dynamodb_table.approval_ledger.name
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.app.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "sentinelops"
        }
      }
      readonlyRootFilesystem = true
    }
  ])
}

resource "aws_ecs_service" "app" {
  name            = local.name_prefix
  cluster         = aws_ecs_cluster.sentinelops.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  enable_execute_command = false

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "sentinelops-api"
    container_port   = var.container_port
  }

  depends_on = [
    aws_lb_listener.http,
    aws_lb_listener.https,
  ]
}
