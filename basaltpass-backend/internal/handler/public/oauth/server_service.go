package oauth

import (
	"basaltpass-backend/internal/handler/public/app/app_user"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"basaltpass-backend/internal/common"
	"basaltpass-backend/internal/config"
	"basaltpass-backend/internal/model"

	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// OAuthServerService OAuth2授权服务器服务
type OAuthServerService struct {
	db *gorm.DB
}

type UserTenantAuthorizationDecision struct {
	Allowed      bool
	JoinRequired bool
	TenantID     uint
	Reason       string
}

// NewOAuthServerService 创建新的OAuth2服务器服务
func NewOAuthServerService() *OAuthServerService {
	return &OAuthServerService{
		db: common.DB(),
	}
}

// AuthorizeRequest 授权请求结构
type AuthorizeRequest struct {
	ClientID            string `form:"client_id" binding:"required"`
	RedirectURI         string `form:"redirect_uri" binding:"required"`
	ResponseType        string `form:"response_type" binding:"required"`
	Scope               string `form:"scope"`
	State               string `form:"state"`
	CodeChallenge       string `form:"code_challenge"`        // PKCE
	CodeChallengeMethod string `form:"code_challenge_method"` // PKCE
	Nonce               string `form:"nonce"`                 // OIDC
}

// TokenRequest 令牌请求结构
type TokenRequest struct {
	GrantType    string `form:"grant_type" binding:"required"`
	Code         string `form:"code"`
	RedirectURI  string `form:"redirect_uri"`
	ClientID     string `form:"client_id"`
	CodeVerifier string `form:"code_verifier"` // PKCE
}

// TokenResponse 令牌响应结构
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
	IDToken      string `json:"id_token,omitempty"`
}

// AuthorizeResponse 授权响应结构
type AuthorizeResponse struct {
	Code  string `json:"code"`
	State string `json:"state,omitempty"`
}

// ValidateAuthorizeRequest 验证授权请求
func (s *OAuthServerService) ValidateAuthorizeRequest(req *AuthorizeRequest) (*model.OAuthClient, error) {
	// 1. 验证response_type
	if req.ResponseType != "code" {
		return nil, errors.New("unsupported_response_type")
	}

	// 2. 查找并验证客户端（预加载App信息以显示应用详情）
	var client model.OAuthClient
	if err := s.db.Where("client_id = ? AND is_active = ?", req.ClientID, true).
		Preload("App").
		Preload("App.Tenant").
		First(&client).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid_client")
		}
		return nil, err
	}

	// 3. 验证redirect_uri
	if !client.ValidateRedirectURI(req.RedirectURI) {
		return nil, errors.New("invalid_redirect_uri")
	}

	// 4. 验证scope（可选）
	if req.Scope != "" {
		if hasScope(req.Scope, "openid") && strings.TrimSpace(req.Nonce) == "" {
			return nil, errors.New("invalid_request")
		}

		requestedScopes := strings.Split(req.Scope, " ")
		allowedScopes := client.GetScopeList()

		for _, reqScope := range requestedScopes {
			found := false
			for _, allowedScope := range allowedScopes {
				if strings.TrimSpace(reqScope) == strings.TrimSpace(allowedScope) {
					found = true
					break
				}
			}
			if !found {
				return nil, errors.New("invalid_scope")
			}
		}
	}

	return &client, nil
}

// ValidateClientCredentials verifies OAuth client_id/client_secret.
func (s *OAuthServerService) ValidateClientCredentials(clientID string, clientSecret string) (*model.OAuthClient, error) {
	clientID = strings.TrimSpace(clientID)
	if clientID == "" || clientSecret == "" {
		return nil, errors.New("invalid_client")
	}

	var client model.OAuthClient
	if err := s.db.Where("client_id = ? AND is_active = ?", clientID, true).First(&client).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid_client")
		}
		return nil, err
	}

	if !client.VerifyClientSecret(clientSecret) {
		return nil, errors.New("invalid_client")
	}

	return &client, nil
}

// resolveClientTenantID resolves tenant ownership for an OAuth client.
// Fallback order:
// 1) client.App.TenantID (preloaded)
// 2) apps.tenant_id by client.AppID
// 3) latest authorization record tenant_id for this client
// 4) creator's tenant_user tenant_id
func (s *OAuthServerService) resolveClientTenantID(client *model.OAuthClient) uint {
	if client == nil {
		return 0
	}

	if client.App.TenantID > 0 {
		return client.App.TenantID
	}

	if client.AppID > 0 {
		var app model.App
		if err := s.db.Select("tenant_id").Where("id = ?", client.AppID).First(&app).Error; err == nil && app.TenantID > 0 {
			return app.TenantID
		}
	}

	if strings.TrimSpace(client.ClientID) != "" {
		var code model.OAuthAuthorizationCode
		if err := s.db.Select("tenant_id").
			Where("client_id = ? AND tenant_id > 0", client.ClientID).
			Order("id DESC").
			First(&code).Error; err == nil && code.TenantID > 0 {
			return code.TenantID
		}
	}

	if client.CreatedBy > 0 {
		var admin model.TenantUser
		if err := s.db.Select("tenant_id").
			Where("user_id = ? AND tenant_id > 0", client.CreatedBy).
			Order("id ASC").
			First(&admin).Error; err == nil && admin.TenantID > 0 {
			return admin.TenantID
		}
	}

	return 0
}

// GenerateAuthorizationCode 生成授权码
func (s *OAuthServerService) GenerateAuthorizationCode(userID uint, req *AuthorizeRequest, client *model.OAuthClient) (string, error) {
	// 生成授权码
	codeBytes := make([]byte, 32)
	if _, err := rand.Read(codeBytes); err != nil {
		return "", err
	}
	code := hex.EncodeToString(codeBytes)

	// 获取租户ID（支持历史脏数据的兜底恢复）
	tenantID := s.resolveClientTenantID(client)

	// 创建授权码记录（包含AppID和TenantID）
	authCode := &model.OAuthAuthorizationCode{
		Code:                code,
		ClientID:            req.ClientID,
		UserID:              userID,
		TenantID:            tenantID,
		AppID:               client.AppID,
		RedirectURI:         req.RedirectURI,
		Scopes:              req.Scope,
		CodeChallenge:       req.CodeChallenge,
		CodeChallengeMethod: req.CodeChallengeMethod,
		ExpiresAt:           time.Now().Add(10 * time.Minute), // 授权码10分钟有效期
		Used:                false,
	}

	if err := s.db.Create(authCode).Error; err != nil {
		return "", err
	}

	return code, nil
}

// HasAppUserAuthorization checks whether a user has already authorized an app.
func (s *OAuthServerService) HasAppUserAuthorization(appID, userID uint) (bool, error) {
	if appID == 0 || userID == 0 {
		return false, nil
	}

	var count int64
	if err := s.db.Model(&model.AppUser{}).
		Where("app_id = ? AND user_id = ?", appID, userID).
		Count(&count).Error; err != nil {
		return false, err
	}

	return count > 0, nil
}

func hasScope(scopeText string, target string) bool {
	for _, s := range strings.Fields(scopeText) {
		if s == target {
			return true
		}
	}
	return false
}

func (s *OAuthServerService) buildIDToken(clientID string, userID uint, nonce string, issuedAt time.Time) (string, error) {
	privateKey, err := GetPrivateKey()
	if err != nil {
		return "", err
	}

	claims := jwt.MapClaims{
		"iss":       config.Get().Server.Address + "/api/v1",
		"sub":       strconv.FormatUint(uint64(userID), 10),
		"aud":       clientID,
		"exp":       issuedAt.Add(time.Hour).Unix(),
		"iat":       issuedAt.Unix(),
		"auth_time": issuedAt.Unix(),
	}
	if nonce != "" {
		claims["nonce"] = nonce
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = GetKeyID()
	return token.SignedString(privateKey)
}

// ExchangeCodeForToken 用授权码换取访问令牌
func (s *OAuthServerService) ExchangeCodeForToken(req *TokenRequest, clientID string, clientSecret string) (*TokenResponse, error) {
	// 1. 验证grant_type
	if req.GrantType != "authorization_code" {
		return nil, errors.New("unsupported_grant_type")
	}

	// 2. 查找授权码
	var authCode model.OAuthAuthorizationCode
	if err := s.db.Where("code = ? AND used = ?", req.Code, false).First(&authCode).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid_grant")
		}
		return nil, err
	}

	// 3. 检查授权码是否过期
	if authCode.IsExpired() {
		return nil, errors.New("invalid_grant")
	}

	// 4. 验证客户端ID匹配
	if authCode.ClientID != clientID {
		return nil, errors.New("invalid_client")
	}

	// 5. 查找并验证客户端
	var client model.OAuthClient
	if err := s.db.Where("client_id = ?", clientID).First(&client).Error; err != nil {
		return nil, errors.New("invalid_client")
	}

	// 6. 验证客户端密钥
	if !client.VerifyClientSecret(clientSecret) {
		return nil, errors.New("invalid_client")
	}

	// 7. 验证redirect_uri
	if req.RedirectURI != authCode.RedirectURI {
		return nil, errors.New("invalid_grant")
	}

	// 8. PKCE验证（如果使用）
	if authCode.CodeChallenge != "" {
		if req.CodeVerifier == "" {
			return nil, errors.New("invalid_request")
		}

		var challenge string
		switch authCode.CodeChallengeMethod {
		case "S256", "":
			// RFC 7636 §4.2: code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
			hash := sha256.Sum256([]byte(req.CodeVerifier))
			challenge = base64.RawURLEncoding.EncodeToString(hash[:])
		case "plain":
			challenge = req.CodeVerifier
		default:
			return nil, errors.New("invalid_request")
		}

		if challenge != authCode.CodeChallenge {
			return nil, errors.New("invalid_grant")
		}
	}

	// 9. 生成访问令牌
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	accessToken := hex.EncodeToString(tokenBytes)

	// 10. 生成刷新令牌
	refreshTokenBytes := make([]byte, 32)
	if _, err := rand.Read(refreshTokenBytes); err != nil {
		return nil, err
	}
	refreshToken := hex.EncodeToString(refreshTokenBytes)

	// 11. 保存访问令牌
	oauthToken := &model.OAuthAccessToken{
		Token:     accessToken,
		ClientID:  authCode.ClientID,
		UserID:    authCode.UserID,
		TenantID:  authCode.TenantID,
		AppID:     authCode.AppID,
		Scopes:    authCode.Scopes,
		ExpiresAt: time.Now().Add(1 * time.Hour), // 访问令牌1小时有效期
	}

	if err := s.db.Create(oauthToken).Error; err != nil {
		return nil, err
	}

	// 11.1 保存刷新令牌
	refreshTokenModel := &model.OAuthRefreshToken{
		Token:         refreshToken,
		ClientID:      authCode.ClientID,
		UserID:        authCode.UserID,
		TenantID:      authCode.TenantID,
		AppID:         authCode.AppID,
		Scopes:        authCode.Scopes,
		ExpiresAt:     time.Now().Add(7 * 24 * time.Hour), // 刷新令牌7天有效期
		AccessTokenID: &oauthToken.ID,
	}

	if err := s.db.Create(refreshTokenModel).Error; err != nil {
		return nil, err
	}

	// 12. 标记授权码为已使用
	if err := s.db.Model(&authCode).Update("used", true).Error; err != nil {
		return nil, err
	}

	// 13. 记录用户对应用的授权关系
	if authCode.AppID > 0 {
		appUserService := app_user.NewAppUserService(s.db)
		if err := appUserService.RecordUserAppAuthorization(authCode.AppID, authCode.UserID, authCode.Scopes); err != nil {
			// 记录日志但不失败，因为这不是关键功能
			// TODO: 可以考虑添加日志记录
			_ = err
		}
	}

	// 14. 更新客户端最后使用时间
	now := time.Now()
	s.db.Model(&client).Update("last_used_at", &now)

	issuedAt := time.Now()
	resp := &TokenResponse{
		AccessToken:  accessToken,
		TokenType:    "Bearer",
		ExpiresIn:    3600, // 1小时
		RefreshToken: refreshToken,
		Scope:        authCode.Scopes,
	}
	if hasScope(authCode.Scopes, "openid") {
		idToken, err := s.buildIDToken(authCode.ClientID, authCode.UserID, authCode.Nonce, issuedAt)
		if err != nil {
			return nil, err
		}
		resp.IDToken = idToken
	}
	return resp, nil
}

// RefreshAccessToken 刷新访问令牌
func (s *OAuthServerService) RefreshAccessToken(refreshToken string, clientID string, clientSecret string) (*TokenResponse, error) {
	// 1. 查找刷新令牌
	var refreshTokenModel model.OAuthRefreshToken
	if err := s.db.Where("token = ? AND client_id = ?", refreshToken, clientID).First(&refreshTokenModel).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid_grant")
		}
		return nil, err
	}

	// 1.1 检查刷新令牌是否过期
	if refreshTokenModel.ExpiresAt.Before(time.Now()) {
		return nil, errors.New("expired_token")
	}

	// 2. 验证客户端
	var client model.OAuthClient
	if err := s.db.Where("client_id = ?", clientID).First(&client).Error; err != nil {
		return nil, errors.New("invalid_client")
	}

	if !client.VerifyClientSecret(clientSecret) {
		return nil, errors.New("invalid_client")
	}

	// 3. 生成新的访问令牌
	tokenBytes := make([]byte, 32)
	if _, err := rand.Read(tokenBytes); err != nil {
		return nil, err
	}
	newAccessToken := hex.EncodeToString(tokenBytes)

	// 4. 生成新的刷新令牌
	refreshTokenBytes := make([]byte, 32)
	if _, err := rand.Read(refreshTokenBytes); err != nil {
		return nil, err
	}
	newRefreshTokenStr := hex.EncodeToString(refreshTokenBytes)

	// 5. 仅删除与本 refresh token 直接关联的那一个 access token，
	//    避免误杀同一用户在其他浏览器/设备上的并发会话。
	if refreshTokenModel.AccessTokenID != nil {
		s.db.Delete(&model.OAuthAccessToken{}, *refreshTokenModel.AccessTokenID)
	}

	// 6. 创建新的访问令牌
	newToken := model.OAuthAccessToken{
		Token:     newAccessToken,
		ClientID:  clientID,
		UserID:    refreshTokenModel.UserID,
		TenantID:  refreshTokenModel.TenantID,
		AppID:     refreshTokenModel.AppID,
		Scopes:    refreshTokenModel.Scopes,
		ExpiresAt: time.Now().Add(time.Hour),
	}

	if err := s.db.Create(&newToken).Error; err != nil {
		return nil, err
	}

	// 7. 删除旧的刷新令牌
	if err := s.db.Delete(&refreshTokenModel).Error; err != nil {
		return nil, err
	}

	// 8. 创建新的刷新令牌
	newRefreshTokenModel := model.OAuthRefreshToken{
		Token:     newRefreshTokenStr,
		ClientID:  clientID,
		UserID:    refreshTokenModel.UserID,
		TenantID:  refreshTokenModel.TenantID,
		AppID:     refreshTokenModel.AppID,
		Scopes:    refreshTokenModel.Scopes,
		ExpiresAt: time.Now().Add(time.Hour * 24 * 30), // 30天
	}

	if err := s.db.Create(&newRefreshTokenModel).Error; err != nil {
		return nil, err
	}

	return &TokenResponse{
		AccessToken:  newAccessToken,
		TokenType:    "Bearer",
		ExpiresIn:    3600,
		RefreshToken: newRefreshTokenStr,
		Scope:        refreshTokenModel.Scopes,
	}, nil
}

// ValidateAccessToken 验证访问令牌
func (s *OAuthServerService) ValidateAccessToken(token string) (*model.OAuthAccessToken, error) {
	var oauthToken model.OAuthAccessToken
	if err := s.db.Preload("User").Preload("Client").Where("token = ?", token).First(&oauthToken).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid_token")
		}
		return nil, err
	}

	if oauthToken.IsExpired() {
		return nil, errors.New("token_expired")
	}

	return &oauthToken, nil
}

// GetUserInfo 获取用户信息（OpenID Connect）
func (s *OAuthServerService) GetUserInfo(token string) (*UserInfoResponse, error) {
	oauthToken, err := s.ValidateAccessToken(token)
	if err != nil {
		return nil, err
	}

	// 检查scope是否包含openid或profile
	scopes := oauthToken.GetScopeList()
	hasProfileScope := false
	for _, scope := range scopes {
		if scope == "openid" || scope == "profile" {
			hasProfileScope = true
			break
		}
	}

	if !hasProfileScope {
		return nil, errors.New("insufficient_scope")
	}

	// 更新用户在应用中的最后活跃时间
	if oauthToken.AppID > 0 {
		appUserService := app_user.NewAppUserService(s.db)
		if err := appUserService.UpdateUserLastActivity(oauthToken.AppID, oauthToken.UserID); err != nil {
			// 记录日志但不失败
			_ = err
		}
	}

	user := oauthToken.User
	response := &UserInfoResponse{
		Sub:           fmt.Sprintf("%d", user.ID),
		Name:          user.Nickname,
		Email:         user.Email,
		EmailVerified: user.EmailVerified,
		Phone:         user.Phone,
		PhoneVerified: user.PhoneVerified,
		Picture:       user.AvatarURL,
		UpdatedAt:     user.UpdatedAt.Unix(),
	}

	return response, nil
}

// UserInfoResponse 用户信息响应（OpenID Connect标准）
type UserInfoResponse struct {
	Sub           string `json:"sub"`                    // 用户唯一标识
	Name          string `json:"name,omitempty"`         // 用户姓名
	Email         string `json:"email,omitempty"`        // 邮箱
	EmailVerified bool   `json:"email_verified"`         // 邮箱是否验证
	Phone         string `json:"phone_number,omitempty"` // 手机号
	PhoneVerified bool   `json:"phone_number_verified"`  // 手机号是否验证
	Picture       string `json:"picture,omitempty"`      // 头像
	UpdatedAt     int64  `json:"updated_at"`             // 更新时间
}

// BuildAuthorizeURL 构建授权URL
func (s *OAuthServerService) BuildAuthorizeURL(baseURL string, req *AuthorizeRequest) (string, error) {
	u, err := url.Parse(baseURL)
	if err != nil {
		return "", err
	}

	q := u.Query()
	q.Set("client_id", req.ClientID)
	q.Set("redirect_uri", req.RedirectURI)
	q.Set("response_type", req.ResponseType)
	if req.Scope != "" {
		q.Set("scope", req.Scope)
	}
	if req.State != "" {
		q.Set("state", req.State)
	}
	if req.CodeChallenge != "" {
		q.Set("code_challenge", req.CodeChallenge)
		q.Set("code_challenge_method", req.CodeChallengeMethod)
	}

	u.RawQuery = q.Encode()
	return u.String(), nil
}

// ResolveTokenClientID resolves the owner client_id of a token.
// It checks both access token and refresh token tables.
func (s *OAuthServerService) ResolveTokenClientID(token string) (clientID string, found bool, err error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return "", false, nil
	}

	var accessToken model.OAuthAccessToken
	if err := s.db.Select("client_id").Where("token = ?", token).First(&accessToken).Error; err == nil {
		return accessToken.ClientID, true, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", false, err
	}

	var refreshToken model.OAuthRefreshToken
	if err := s.db.Select("client_id").Where("token = ?", token).First(&refreshToken).Error; err == nil {
		return refreshToken.ClientID, true, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return "", false, err
	}

	return "", false, nil
}

// RevokeToken 撤销令牌
func (s *OAuthServerService) RevokeToken(token string) error {
	// 删除访问令牌
	accessTokenErr := s.db.Where("token = ?", token).Delete(&model.OAuthAccessToken{}).Error

	// 删除刷新令牌
	refreshTokenErr := s.db.Where("token = ?", token).Delete(&model.OAuthRefreshToken{}).Error

	// 只要有一个删除成功就认为操作成功
	if accessTokenErr != nil && refreshTokenErr != nil {
		return accessTokenErr
	}

	return nil
}

func (s *OAuthServerService) EnsureUserTenantIdentity(userID, tenantID uint, role model.TenantRole) error {
	if userID == 0 || tenantID == 0 {
		return errors.New("invalid_identity_context")
	}
	if role == "" {
		role = model.TenantRoleMember
	}

	var existing model.TenantUser
	err := s.db.Where("user_id = ? AND tenant_id = ?", userID, tenantID).First(&existing).Error
	if err == nil {
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	return s.db.Create(&model.TenantUser{
		UserID:   userID,
		TenantID: tenantID,
		Role:     role,
	}).Error
}

func (s *OAuthServerService) EvaluateUserTenantAuthorization(userID uint, client *model.OAuthClient) (*UserTenantAuthorizationDecision, error) {
	var user model.User
	if err := s.db.Select("id", "tenant_id", "is_system_admin").First(&user, userID).Error; err != nil {
		return nil, errors.New("user_not_found")
	}

	tenantID := s.resolveClientTenantID(client)
	if tenantID == 0 {
		return nil, errors.New("app_tenant_not_found")
	}

	if user.IsSystemAdmin != nil && *user.IsSystemAdmin {
		return &UserTenantAuthorizationDecision{Allowed: true, TenantID: tenantID}, nil
	}

	if user.TenantID == tenantID {
		return &UserTenantAuthorizationDecision{Allowed: true, TenantID: tenantID}, nil
	}

	if user.TenantID == 0 {
		var membershipCount int64
		if err := s.db.Model(&model.TenantUser{}).
			Where("user_id = ? AND tenant_id = ?", userID, tenantID).
			Count(&membershipCount).Error; err != nil {
			return nil, err
		}
		if membershipCount > 0 {
			return &UserTenantAuthorizationDecision{Allowed: true, TenantID: tenantID}, nil
		}

		return &UserTenantAuthorizationDecision{
			Allowed:      false,
			JoinRequired: true,
			TenantID:     tenantID,
			Reason:       "join_required",
		}, nil
	}

	return &UserTenantAuthorizationDecision{
		Allowed:      false,
		JoinRequired: false,
		TenantID:     tenantID,
		Reason:       "tenant_mismatch",
	}, nil
}

// ValidateUserTenant 验证用户是否属于应用所在的租户
func (s *OAuthServerService) ValidateUserTenant(userID uint, client *model.OAuthClient) error {
	decision, err := s.EvaluateUserTenantAuthorization(userID, client)
	if err != nil {
		return err
	}
	if decision.Allowed {
		return nil
	}
	if decision.JoinRequired {
		return errors.New("join_required")
	}
	if decision.Reason != "" {
		return errors.New(decision.Reason)
	}
	return errors.New("tenant_mismatch")
}
