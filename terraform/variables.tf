variable "region" {
  type    = string
  default = "ap-south-1"
}
variable "name" {
  type    = string
  default = "stockroom"
}
variable "kubernetes_version" {
  type    = string
  default = "1.34"
}
variable "admin_principal_arn" {
  description = "IAM role ARN used by the operator; use an IAM role ARN, not an STS session ARN."
  type        = string
}
variable "api_allowed_cidrs" {
  description = "Public IP ranges allowed to reach the EKS API. Private endpoint access is also enabled."
  type        = list(string)
  validation {
    condition     = length(var.api_allowed_cidrs) > 0 && alltrue([for c in var.api_allowed_cidrs : can(cidrnetmask(c)) && c != "0.0.0.0/0"])
    error_message = "Supply at least one IPv4 CIDR; unrestricted public access is not allowed."
  }
}
variable "node_instance_type" {
  type    = string
  default = "t3.medium"
}
variable "github_repository" {
  description = "Optional owner/repository for GitHub Actions OIDC deployment."
  type        = string
  default     = ""
}
variable "github_oidc_provider_arn" {
  description = "Reuse an existing GitHub OIDC provider when the AWS account already has one."
  type        = string
  default     = ""
}
