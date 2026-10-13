mock_provider "aws" {
  mock_data "aws_availability_zones" {
    defaults = { names = ["ap-south-1a", "ap-south-1b"] }
  }
}
variables {
  admin_principal_arn = "arn:aws:iam::123456789012:role/StockroomOperator"
  api_allowed_cidrs   = ["203.0.113.10/32"]
}
run "private_workers_and_restricted_api" {
  command = plan
  assert {
    condition     = length(aws_subnet.public) == 2 && length(aws_subnet.private) == 2
    error_message = "The network must span two public and two private subnets."
  }
  assert {
    condition     = aws_eks_node_group.main.scaling_config[0].desired_size == 2
    error_message = "Two workers are required for the application and monitoring stack."
  }
  assert {
    condition     = aws_eks_cluster.main.vpc_config[0].endpoint_private_access && aws_eks_cluster.main.access_config[0].authentication_mode == "API"
    error_message = "EKS must expose a private endpoint and use access entries."
  }
  assert {
    condition     = aws_launch_template.nodes.metadata_options[0].http_tokens == "required"
    error_message = "Nodes must require IMDSv2."
  }
}
