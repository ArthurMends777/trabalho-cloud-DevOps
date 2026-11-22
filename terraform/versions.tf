terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Estado remoto com lock (recomendado em equipe). Crie antes o bucket S3 e a tabela DynamoDB,
  # depois descomente:
  # backend "s3" {
  #   bucket         = "meu-bucket-tfstate"
  #   key            = "loja-veloz/terraform.tfstate"
  #   region         = "sa-east-1"
  #   dynamodb_table = "tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.tags
  }
}
