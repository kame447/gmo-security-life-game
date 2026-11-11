# ユーザー認証（Cognito ユーザープール）
# サインイン方式・属性・MFA などの仕様は未決定のため、メールアドレスでのサインインで仮置き

locals {
  # Hosted UI のドメインプレフィックスはリージョン内で一意である必要があるため、アカウント ID 由来の値を付ける
  cognito_domain_prefix = coalesce(
    var.cognito_domain_prefix,
    "${local.name}-${substr(sha1(data.aws_caller_identity.current.account_id), 0, 8)}",
  )

  cognito_issuer    = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  cognito_hosted_ui = "${aws_cognito_user_pool_domain.main.domain}.auth.${var.region}.amazoncognito.com"
  cloudfront_url    = "https://${aws_cloudfront_distribution.main.domain_name}"
}

resource "aws_cognito_user_pool" "main" {
  name = local.name

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  # TOTP による MFA を任意で使えるようにする（必須化は未決定）
  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = !var.cognito_allow_self_signup
  }

  # メール送信は Cognito 既定（送信数に上限あり）。本番運用時は SES に切り替える
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }
}

# フロントエンド（SPA）用のクライアント。ブラウザに置くためシークレットは発行しない
resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # Hosted UI を使う場合の認可コードフロー（PKCE）
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = concat(["${local.cloudfront_url}/"], var.cognito_extra_callback_urls)
  logout_urls                          = concat(["${local.cloudfront_url}/"], var.cognito_extra_logout_urls)

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = local.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

# バックエンドでの JWT 検証用に JWKS を取得し、issuer などと一緒に Parameter Store に置く。
# EC2 は NAT がなくインターネット上の JWKS を取りに行けないため、SSM エンドポイント経由で読ませる。
# ユーザープールの署名鍵は自動ではローテーションされないので、apply 時点の値で足りる。
data "http" "cognito_jwks" {
  url = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.main.id}/.well-known/jwks.json"

  request_headers = {
    Accept = "application/json"
  }

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "Cognito の JWKS を取得できませんでした。"
    }
  }
}

resource "aws_ssm_parameter" "cognito" {
  for_each = {
    "user-pool-id" = aws_cognito_user_pool.main.id
    "client-id"    = aws_cognito_user_pool_client.web.id
    "issuer"       = local.cognito_issuer
    "jwks"         = data.http.cognito_jwks.response_body
  }

  name  = "${local.parameter_prefix}/cognito/${each.key}"
  type  = "String"
  value = each.value
}
