variable "region" {
  description = "Região AWS"
  type        = string
  default     = "sa-east-1"
}

variable "project" {
  description = "Nome do projeto (prefixo dos recursos)"
  type        = string
  default     = "loja-veloz"
}

variable "environment" {
  description = "Ambiente: dev, staging ou prod"
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment deve ser dev, staging ou prod."
  }
}

variable "vpc_cidr" {
  description = "CIDR da VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "cluster_version" {
  description = "Versão do Kubernetes (confira as versões suportadas pelo EKS antes de aplicar)"
  type        = string
  default     = "1.34"
}

variable "node_instance_types" {
  description = "Tipos de instância do node group"
  type        = list(string)
  default     = ["t3.medium"]
}

variable "node_min_size" {
  description = "Mínimo de nós"
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Máximo de nós (limite do autoscaling de nós)"
  type        = number
  default     = 6
}

variable "node_desired_size" {
  description = "Quantidade inicial de nós"
  type        = number
  default     = 2
}
