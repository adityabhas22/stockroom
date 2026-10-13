locals {
  github_enabled      = var.github_repository != ""
  github_provider_arn = var.github_oidc_provider_arn != "" ? var.github_oidc_provider_arn : try(aws_iam_openid_connect_provider.github[0].arn, "")
}
resource "aws_iam_openid_connect_provider" "github" {
  count          = local.github_enabled && var.github_oidc_provider_arn == "" ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}
resource "aws_iam_role" "deploy" {
  count = local.github_enabled ? 1 : 0
  name  = "${var.name}-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow", Action = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = local.github_provider_arn }
      Condition = { StringEquals = {
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:environment:capstone"
      } }
    }]
  })
}
resource "aws_iam_role_policy" "deploy" {
  count = local.github_enabled ? 1 : 0
  role  = aws_iam_role.deploy[0].id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["eks:DescribeCluster"], Resource = aws_eks_cluster.main.arn }]
  })
}
resource "aws_eks_access_entry" "deploy" {
  count             = local.github_enabled ? 1 : 0
  cluster_name      = aws_eks_cluster.main.name
  principal_arn     = aws_iam_role.deploy[0].arn
  type              = "STANDARD"
  kubernetes_groups = ["stockroom-deploy"]
}
resource "aws_eks_access_policy_association" "deploy" {
  count         = local.github_enabled ? 1 : 0
  cluster_name  = aws_eks_cluster.main.name
  principal_arn = aws_eks_access_entry.deploy[0].principal_arn
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSEditPolicy"
  access_scope {
    type       = "namespace"
    namespaces = ["stockroom"]
  }
}
