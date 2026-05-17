package oauth

import (
	"basaltpass-backend/internal/common"
	"basaltpass-backend/internal/config"
	"basaltpass-backend/internal/service/aduit"
	serviceauth "basaltpass-backend/internal/service/auth"
	"encoding/base64"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"basaltpass-backend/internal/model"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
)

var oauthServerService = NewOAuthServerService()

// AuthorizeHandler 处理OAuth2授权请求
// GET /oauth/authorize
func AuthorizeHandler(c *fiber.Ctx) error {
	// 解析授权请求参数
	req := &AuthorizeRequest{
		ClientID:            c.Query("client_id"),
		RedirectURI:         c.Query("redirect_uri"),
		ResponseType:        c.Query("response_type"),
		Scope:               c.Query("scope"),
		State:               c.Query("state"),
		CodeChallenge:       c.Query("code_challenge"),
		CodeChallengeMethod: c.Query("code_challenge_method"),
		Nonce:               c.Query("nonce"),
	}

	// 验证授权请求
	client, err := oauthServerService.ValidateAuthorizeRequest(req)
	if err != nil {
		return redirectWithErrorIfAllowed(c, req.ClientID, req.RedirectURI, err.Error(), req.State)
	}

	// 检查用户是否已登录
	userID := c.Locals("userID")
	if userID == nil {
		// Hosted login flow uses an HttpOnly cookie; browser redirects can't attach Authorization headers.
		if uid, ok := tryUserIDFromAccessTokenCookie(c); ok {
			c.Locals("userID", uid)
			userID = uid
		}
	}
	if userID == nil {
		// 用户未登录，重定向到登录页面
		// 构建租户特定的登录URL
		loginURL := buildLoginURLWithTenant(c, req, client)
		return c.Redirect(loginURL, http.StatusFound)
	}

	// 用户已登录，验证用户是否属于该租户
	uid := userID.(uint)
	decision, err := oauthServerService.EvaluateUserTenantAuthorization(uid, client)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":             "tenant_context_error",
			"error_description": err.Error(),
		})
	}

	// 用户已登录且属于正确的租户，重定向到前端托管的授权同意页面
	if decision.Allowed {
		alreadyAuthorized, err := oauthServerService.HasAppUserAuthorization(client.AppID, uid)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":             "server_error",
				"error_description": "Failed to check existing app authorization",
			})
		}

		// Skip consent when the user has already authorized this app.
		if alreadyAuthorized {
			code, err := oauthServerService.GenerateAuthorizationCode(uid, req, client)
			if err != nil {
				return redirectWithError(c, req.RedirectURI, "server_error", req.State)
			}

			aduit.LogAudit(uid, "OAuth2授权(免再次确认)", "oauth_client", req.ClientID, c.IP(), c.Get("User-Agent"))
			return redirectWithCode(c, req.RedirectURI, code, req.State)
		}
	}

	consentURL := buildConsentURL(req, client, decision)
	return c.Redirect(consentURL, http.StatusFound)
}

func tryUserIDFromAccessTokenCookie(c *fiber.Ctx) (uint, bool) {
	// OAuth hosted flow can come from different consoles (user/tenant/admin),
	// so we need to accept scoped cookie names as well.
	cookieNames := []string{
		"access_token",
		"access_token_user",
		"access_token_tenant",
		"access_token_admin",
	}

	for _, name := range cookieNames {
		tokenStr := strings.TrimSpace(c.Cookies(name))
		if tokenStr == "" {
			continue
		}
		if uid, ok := parseUserIDFromJWT(tokenStr); ok {
			return uid, true
		}
	}

	return 0, false
}

func parseUserIDFromJWT(tokenStr string) (uint, bool) {
	secret, err := common.JWTSecret()
	if err != nil {
		return 0, false
	}

	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrTokenSignatureInvalid
		}
		return secret, nil
	})
	if err != nil || token == nil || !token.Valid {
		return 0, false
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, false
	}
	if err := serviceauth.ValidateAccessTokenType(claims); err != nil {
		return 0, false
	}
	sub, exists := claims["sub"]
	if !exists {
		return 0, false
	}
	if subFloat, ok := sub.(float64); ok {
		return uint(subFloat), true
	}
	if subStr, ok := sub.(string); ok {
		uid, err := strconv.ParseUint(subStr, 10, 64)
		if err == nil {
			return uint(uid), true
		}
	}
	return 0, false
}

func buildConsentURL(req *AuthorizeRequest, client *model.OAuthClient, decision *UserTenantAuthorizationDecision) string {
	uiBaseURL := strings.TrimRight(config.Get().UI.BaseURL, "/")
	consentPath := "/oauth-consent"
	base := consentPath
	if uiBaseURL != "" {
		base = uiBaseURL + consentPath
	}

	q := url.Values{}
	q.Set("client_id", req.ClientID)
	q.Set("redirect_uri", req.RedirectURI)
	if req.Scope != "" {
		q.Set("scope", req.Scope)
	}
	if req.State != "" {
		q.Set("state", req.State)
	}
	if req.CodeChallenge != "" {
		q.Set("code_challenge", req.CodeChallenge)
	}
	if req.CodeChallengeMethod != "" {
		q.Set("code_challenge_method", req.CodeChallengeMethod)
	}
	if req.Nonce != "" {
		q.Set("nonce", req.Nonce)
	}
	if client != nil {
		appTenantID := oauthServerService.resolveClientTenantID(client)
		if appTenantID > 0 {
			q.Set("app_tenant_id", strconv.FormatUint(uint64(appTenantID), 10))
		}
	}
	if decision != nil {
		if decision.JoinRequired {
			q.Set("current_user_join_required", "true")
		}
		if decision.TenantID > 0 {
			q.Set("decision_tenant_id", strconv.FormatUint(uint64(decision.TenantID), 10))
		}
	}
	if client != nil {
		// Prefer app display fields when available.
		if strings.TrimSpace(client.App.Name) != "" {
			q.Set("client_name", client.App.Name)
		}
		if strings.TrimSpace(client.App.Description) != "" {
			q.Set("client_description", client.App.Description)
		}
		if strings.TrimSpace(client.App.PrivacyPolicyURL) != "" {
			q.Set("privacy_policy_url", client.App.PrivacyPolicyURL)
		}
		if strings.TrimSpace(client.App.TermsOfServiceURL) != "" {
			q.Set("terms_of_service_url", client.App.TermsOfServiceURL)
		}
		if client.App.IsVerified {
			q.Set("is_verified", "true")
		}
	}

	return base + "?" + q.Encode()
}

// ConsentHandler 处理用户授权同意
// POST /oauth/consent
func ConsentHandler(c *fiber.Ctx) error {
	// 检查用户是否已登录
	userIDVal := c.Locals("userID")
	if userIDVal == nil {
		if uid, ok := tryUserIDFromAccessTokenCookie(c); ok {
			c.Locals("userID", uid)
			userIDVal = uid
		}
	}
	if userIDVal == nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{"error": "unauthorized"})
	}
	userID := userIDVal.(uint)

	// 解析表单数据
	clientID := c.FormValue("client_id")
	redirectURI := c.FormValue("redirect_uri")
	state := c.FormValue("state")
	scope := c.FormValue("scope")
	codeChallenge := c.FormValue("code_challenge")
	codeChallengeMethod := c.FormValue("code_challenge_method")
	nonce := c.FormValue("nonce")
	selectedAccessToken := strings.TrimSpace(c.FormValue("selected_access_token"))
	joinTenant := strings.EqualFold(strings.TrimSpace(c.FormValue("join_tenant")), "true") || c.FormValue("join_tenant") == "1"
	action := c.FormValue("action") // "allow" 或 "deny"

	if action != "allow" {
		// 用户拒绝授权
		return redirectWithErrorIfAllowed(c, clientID, redirectURI, "access_denied", state)
	}

	if selectedAccessToken != "" {
		selectedUserID, ok := parseUserIDFromJWT(selectedAccessToken)
		if !ok || selectedUserID == 0 {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error":             "invalid_selected_session",
				"error_description": "Selected account session is invalid or expired",
			})
		}
		userID = selectedUserID
	}

	// 构建授权请求
	req := &AuthorizeRequest{
		ClientID:            clientID,
		RedirectURI:         redirectURI,
		ResponseType:        "code",
		Scope:               scope,
		State:               state,
		CodeChallenge:       codeChallenge,
		CodeChallengeMethod: codeChallengeMethod,
		Nonce:               nonce,
	}

	// 验证请求
	client, err := oauthServerService.ValidateAuthorizeRequest(req)
	if err != nil {
		return redirectWithErrorIfAllowed(c, clientID, redirectURI, err.Error(), state)
	}

	decision, err := oauthServerService.EvaluateUserTenantAuthorization(userID, client)
	if err != nil {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":             "tenant_context_error",
			"error_description": err.Error(),
		})
	}

	if !decision.Allowed {
		if decision.JoinRequired {
			if !joinTenant {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error":             "join_confirmation_required",
					"error_description": "Global account must confirm tenant join before authorization",
				})
			}
			if err := oauthServerService.EnsureUserTenantIdentity(userID, decision.TenantID, model.TenantRoleMember); err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":             "identity_join_failed",
					"error_description": "Failed to join tenant identity",
				})
			}
		} else {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":             "tenant_mismatch",
				"error_description": "User does not belong to the tenant of this application",
			})
		}
	}

	// 生成授权码
	code, err := oauthServerService.GenerateAuthorizationCode(userID, req, client)
	if err != nil {
		return redirectWithError(c, redirectURI, "server_error", state)
	}

	// 记录审计日志
	aduit.LogAudit(userID, "OAuth2授权", "oauth_client", clientID, c.IP(), c.Get("User-Agent"))

	// 重定向回客户端
	return redirectWithCode(c, redirectURI, code, state)
}

// TokenHandler 处理OAuth2令牌请求
// POST /oauth/token
func TokenHandler(c *fiber.Ctx) error {
	grantType := c.FormValue("grant_type")

	switch grantType {
	case "authorization_code":
		return handleAuthorizationCodeGrant(c)
	case "refresh_token":
		return handleRefreshTokenGrant(c)
	case "urn:ietf:params:oauth:grant-type:token-exchange":
		return handleTokenExchangeGrant(c)
	default:
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "unsupported_grant_type",
			"error_description": "Grant type not supported",
		})
	}
}

// handleAuthorizationCodeGrant 处理授权码授权
func handleAuthorizationCodeGrant(c *fiber.Ctx) error {
	// 解析令牌请求
	req := &TokenRequest{
		GrantType:    c.FormValue("grant_type"),
		Code:         c.FormValue("code"),
		RedirectURI:  c.FormValue("redirect_uri"),
		ClientID:     c.FormValue("client_id"),
		CodeVerifier: c.FormValue("code_verifier"),
	}

	// 获取客户端认证信息（Basic Auth或表单参数）
	clientID, clientSecret := extractClientCredentials(c)
	if clientID == "" {
		clientID = req.ClientID
	}

	if clientID == "" || clientSecret == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":             "invalid_client",
			"error_description": "Client authentication failed",
		})
	}

	// 交换令牌
	tokenResponse, err := oauthServerService.ExchangeCodeForToken(req, clientID, clientSecret)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             err.Error(),
			"error_description": "Authorization code exchange failed",
		})
	}

	return c.JSON(tokenResponse)
}

// handleRefreshTokenGrant 处理刷新令牌授权
func handleRefreshTokenGrant(c *fiber.Ctx) error {
	refreshToken := c.FormValue("refresh_token")

	// 获取客户端认证信息
	clientID, clientSecret := extractClientCredentials(c)
	if clientID == "" || clientSecret == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":             "invalid_client",
			"error_description": "Client authentication failed",
		})
	}

	// 刷新令牌
	tokenResponse, err := oauthServerService.RefreshAccessToken(refreshToken, clientID, clientSecret)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             err.Error(),
			"error_description": "Refresh token failed",
		})
	}

	return c.JSON(tokenResponse)
}

// UserInfoHandler 处理用户信息请求（OpenID Connect）
// GET /oauth/userinfo
func UserInfoHandler(c *fiber.Ctx) error {
	// 从Authorization头获取访问令牌
	authHeader := c.Get("Authorization")
	if !strings.HasPrefix(authHeader, "Bearer ") {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":             "invalid_token",
			"error_description": "Missing or invalid access token",
		})
	}

	token := strings.TrimPrefix(authHeader, "Bearer ")

	// 获取用户信息
	userInfo, err := oauthServerService.GetUserInfo(token)
	if err != nil {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error":             err.Error(),
			"error_description": "Failed to get user info",
		})
	}

	return c.JSON(userInfo)
}

// IntrospectHandler 令牌内省端点
// POST /oauth/introspect
func IntrospectHandler(c *fiber.Ctx) error {
	authenticatedClientID := getAuthenticatedOAuthClientID(c)
	if authenticatedClientID == "" {
		return oauthInvalidClient(c)
	}

	token := strings.TrimSpace(c.FormValue("token"))
	if token == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_request",
			"error_description": "Missing token parameter",
		})
	}

	// 验证令牌
	oauthToken, err := oauthServerService.ValidateAccessToken(token)
	if err != nil {
		return c.JSON(fiber.Map{
			"active": false,
		})
	}

	if oauthToken.ClientID != authenticatedClientID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":             "access_denied",
			"error_description": "Token does not belong to authenticated client",
		})
	}

	// 返回令牌信息
	resp := fiber.Map{
		"active":    true,
		"client_id": oauthToken.ClientID,
		"username":  oauthToken.User.Email,
		"scope":     oauthToken.Scopes,
		"exp":       oauthToken.ExpiresAt.Unix(),
		"iat":       oauthToken.CreatedAt.Unix(),
		"sub":       oauthToken.UserID,
	}

	// RFC 8693 §4.1 — include actor information for exchanged tokens
	if oauthToken.IsExchanged && oauthToken.ActorClientID != "" {
		resp["act"] = fiber.Map{
			"client_id": oauthToken.ActorClientID,
			"app_id":    oauthToken.ActorAppID,
		}
	}

	return c.JSON(resp)
}

// RevokeHandler 令牌撤销端点
// POST /oauth/revoke
func RevokeHandler(c *fiber.Ctx) error {
	authenticatedClientID := getAuthenticatedOAuthClientID(c)
	if authenticatedClientID == "" {
		return oauthInvalidClient(c)
	}

	token := strings.TrimSpace(c.FormValue("token"))
	if token == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             "invalid_request",
			"error_description": "Missing token parameter",
		})
	}

	tokenClientID, found, err := oauthServerService.ResolveTokenClientID(token)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "server_error",
		})
	}
	if !found {
		// RFC7009 recommends treating unknown tokens as a successful no-op.
		return c.SendStatus(fiber.StatusOK)
	}
	if tokenClientID != authenticatedClientID {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error":             "access_denied",
			"error_description": "Token does not belong to authenticated client",
		})
	}

	// 撤销令牌
	err = oauthServerService.RevokeToken(token)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "server_error",
		})
	}

	return c.SendStatus(fiber.StatusOK)
}

// 辅助函数

// buildLoginURLWithTenant 构建租户特定的登录URL，包含OAuth2参数
func buildLoginURLWithTenant(c *fiber.Ctx, req *AuthorizeRequest, client *model.OAuthClient) string {
	var tenantCode string
	tenantID := oauthServerService.resolveClientTenantID(client)
	if tenantID > 0 {
		var tenant model.Tenant
		if err := oauthServerService.db.Select("id", "code").First(&tenant, tenantID).Error; err == nil {
			tenantCode = strings.TrimSpace(tenant.Code)
		}
	}

	uiBaseURL := strings.TrimRight(config.Get().UI.BaseURL, "/")

	// 构建租户登录URL：/auth/tenant/{tenant_code}/login
	var loginURL string
	if tenantCode != "" {
		loginURL = uiBaseURL + "/auth/tenant/" + tenantCode + "/login"
	} else {
		// 如果没有租户code，使用平台登录
		loginURL = uiBaseURL + "/login"
	}

	// 构建原始OAuth2授权URL作为重定向参数
	originalURL := "/api/v1/oauth/authorize?" + c.Context().QueryArgs().String()

	return loginURL + "?redirect=" + url.QueryEscape(originalURL)
}

// buildLoginURL 构建登录URL，包含OAuth2参数（保留向后兼容性）
func buildLoginURL(c *fiber.Ctx, req *AuthorizeRequest) string {
	loginURL := "/login"
	uiBaseURL := strings.TrimRight(config.Get().UI.BaseURL, "/")
	if uiBaseURL != "" {
		loginURL = uiBaseURL + "/login"
	}

	// 构建原始OAuth2授权URL作为重定向参数
	originalURL := "/api/v1/oauth/authorize?" + c.Context().QueryArgs().String()

	return loginURL + "?redirect=" + url.QueryEscape(originalURL)
}

// redirectWithError 带错误信息重定向
func redirectWithError(c *fiber.Ctx, redirectURI, errorCode, state string) error {
	u, err := url.Parse(redirectURI)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid_redirect_uri"})
	}

	q := u.Query()
	q.Set("error", errorCode)
	if state != "" {
		q.Set("state", state)
	}

	u.RawQuery = q.Encode()
	return c.Redirect(u.String(), http.StatusFound)
}

// redirectWithErrorIfAllowed redirects only when redirect_uri is registered on the client.
// Per OAuth2 security recommendations, invalid client/redirect_uri errors must not redirect.
func redirectWithErrorIfAllowed(c *fiber.Ctx, clientID, redirectURI, errorCode, state string) error {
	if !isRedirectURIAllowedForClient(clientID, redirectURI) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":             errorCode,
			"error_description": "invalid redirect_uri",
		})
	}
	return redirectWithError(c, redirectURI, errorCode, state)
}

func isRedirectURIAllowedForClient(clientID, redirectURI string) bool {
	clientID = strings.TrimSpace(clientID)
	redirectURI = strings.TrimSpace(redirectURI)
	if clientID == "" || redirectURI == "" {
		return false
	}

	var client model.OAuthClient
	if err := oauthServerService.db.Select("client_id", "redirect_uris").
		Where("client_id = ?", clientID).
		First(&client).Error; err != nil {
		return false
	}

	return client.ValidateRedirectURI(redirectURI)
}

// redirectWithCode 带授权码重定向
func redirectWithCode(c *fiber.Ctx, redirectURI, code, state string) error {
	u, err := url.Parse(redirectURI)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid_redirect_uri"})
	}

	q := u.Query()
	q.Set("code", code)
	if state != "" {
		q.Set("state", state)
	}

	u.RawQuery = q.Encode()
	return c.Redirect(u.String(), http.StatusFound)
}

// extractClientCredentials 提取客户端凭证（支持Basic Auth和表单参数）
func extractClientCredentials(c *fiber.Ctx) (clientID, clientSecret string) {
	// 优先从 Authorization: Basic 获取（OAuth2 标准方式）
	if basicID, basicSecret, ok := parseBasicAuthCredentials(c.Get("Authorization")); ok {
		return basicID, basicSecret
	}

	// 向后兼容：支持自定义头 client_id/client_secret
	clientID = strings.TrimSpace(c.Get("client_id"))
	clientSecret = c.Get("client_secret")

	if clientID != "" && clientSecret != "" {
		return clientID, clientSecret
	}

	// 尝试从表单参数获取
	clientID = strings.TrimSpace(c.FormValue("client_id"))
	clientSecret = c.FormValue("client_secret")

	return clientID, clientSecret
}

func parseBasicAuthCredentials(authHeader string) (clientID, clientSecret string, ok bool) {
	parts := strings.SplitN(strings.TrimSpace(authHeader), " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Basic") {
		return "", "", false
	}

	decoded, err := base64.StdEncoding.DecodeString(strings.TrimSpace(parts[1]))
	if err != nil {
		return "", "", false
	}

	clientID, clientSecret, ok = strings.Cut(string(decoded), ":")
	if !ok {
		return "", "", false
	}
	clientID = strings.TrimSpace(clientID)
	if clientID == "" || clientSecret == "" {
		return "", "", false
	}

	return clientID, clientSecret, true
}
