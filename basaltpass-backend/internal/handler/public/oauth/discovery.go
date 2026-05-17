package oauth

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"fmt"
	"math/big"
	"sync"

	"github.com/gofiber/fiber/v2"
)

var (
	// 全局RSA密钥对
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
	keyID      = "basaltpass-rsa-2024"
	keyMutex   sync.RWMutex
)

// OIDCDiscoveryResponse OIDC Discovery响应
type OIDCDiscoveryResponse struct {
	Issuer                            string   `json:"issuer"`
	AuthorizationEndpoint             string   `json:"authorization_endpoint"`
	TokenEndpoint                     string   `json:"token_endpoint"`
	UserinfoEndpoint                  string   `json:"userinfo_endpoint"`
	JwksURI                           string   `json:"jwks_uri"`
	RegistrationEndpoint              string   `json:"registration_endpoint,omitempty"`
	ScopesSupported                   []string `json:"scopes_supported"`
	ResponseTypesSupported            []string `json:"response_types_supported"`
	ResponseModesSupported            []string `json:"response_modes_supported"`
	GrantTypesSupported               []string `json:"grant_types_supported"`
	TokenEndpointAuthMethodsSupported []string `json:"token_endpoint_auth_methods_supported"`
	SubjectTypesSupported             []string `json:"subject_types_supported"`
	IDTokenSigningAlgValuesSupported  []string `json:"id_token_signing_alg_values_supported"`
	ClaimsSupported                   []string `json:"claims_supported"`
	CodeChallengeMethodsSupported     []string `json:"code_challenge_methods_supported"`

	// TODO ⬇️ One-Tap Auth支持
	CheckSessionIframe string `json:"check_session_iframe,omitempty"`
	EndSessionEndpoint string `json:"end_session_endpoint,omitempty"`
}

// DiscoveryHandler OIDC Discovery端点
// GET /.well-known/openid-configuration
func DiscoveryHandler(c *fiber.Ctx) error {
	// 构建基础URL
	scheme := "http"
	if c.Secure() {
		scheme = "https"
	}
	baseURL := scheme + "://" + c.Get("Host")

	discovery := &OIDCDiscoveryResponse{
		Issuer:                baseURL + "/api/v1",
		AuthorizationEndpoint: baseURL + "/api/v1/oauth/authorize",
		TokenEndpoint:         baseURL + "/api/v1/oauth/token",
		UserinfoEndpoint:      baseURL + "/api/v1/oauth/userinfo",
		JwksURI:               baseURL + "/api/v1/oauth/jwks",

		ScopesSupported: []string{
			"openid",
			"profile",
			"email",
			"offline_access",
		},
		ResponseTypesSupported: []string{
			"code",
		},
		ResponseModesSupported: []string{
			"query",
			"fragment",
			// TODO ⬇️ "web_message", // One-Tap Auth支持
		},
		GrantTypesSupported: []string{
			"authorization_code",
			"refresh_token",
			"urn:ietf:params:oauth:grant-type:token-exchange",
		},
		TokenEndpointAuthMethodsSupported: []string{
			"client_secret_basic",
			"client_secret_post",
		},
		SubjectTypesSupported: []string{
			"public",
		},
		IDTokenSigningAlgValuesSupported: []string{
			"RS256",
		},
		ClaimsSupported: []string{
			"sub",
			"email",
			"email_verified",
			"name",
			"nickname",
			"picture",
			"preferred_username",
		},
		CodeChallengeMethodsSupported: []string{
			"plain",
			"S256",
		},

		// TODO ⬇️ One-Tap Auth和Silent Auth端点
		CheckSessionIframe: baseURL + "/api/v1/check_session_iframe",
		EndSessionEndpoint: baseURL + "/api/v1/end_session",
	}

	return c.JSON(discovery)
}

// JWKSHandler JWKS端点
// GET /oauth/jwks
func JWKSHandler(c *fiber.Ctx) error {
	keyMutex.RLock()
	defer keyMutex.RUnlock()

	// 确保密钥已初始化
	if publicKey == nil {
		if err := initKeys(); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error":             "key_generation_failed",
				"error_description": "Failed to generate RSA keys",
			})
		}
	}

	// 生成RSA公钥的JWK
	jwk, err := generateRSAJWK(publicKey, keyID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":             "jwk_generation_failed",
			"error_description": "Failed to generate JWK",
		})
	}

	jwks := map[string]interface{}{
		"keys": []interface{}{jwk},
	}

	return c.JSON(jwks)
}

// initKeys 初始化RSA密钥对
func initKeys() error {
	if privateKey != nil {
		return nil // 已经初始化
	}

	// 生成2048位RSA密钥对
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("failed to generate RSA key: %w", err)
	}

	privateKey = key
	publicKey = &key.PublicKey
	return nil
}

// generateRSAJWK 生成RSA公钥的JWK表示
func generateRSAJWK(pubKey *rsa.PublicKey, kid string) (map[string]interface{}, error) {
	// 将大整数转换为base64url编码
	nBytes := pubKey.N.Bytes()
	eBytes := big.NewInt(int64(pubKey.E)).Bytes()

	// Base64URL编码（无填充）
	n := base64.RawURLEncoding.EncodeToString(nBytes)
	e := base64.RawURLEncoding.EncodeToString(eBytes)

	jwk := map[string]interface{}{
		"kty": "RSA",   // 密钥类型
		"use": "sig",   // 用途：签名
		"alg": "RS256", // 算法
		"kid": kid,     // 密钥ID
		"n":   n,       // RSA模数
		"e":   e,       // RSA指数
	}

	return jwk, nil
}

// GetPrivateKey 获取私钥（用于JWT签名）
func GetPrivateKey() (*rsa.PrivateKey, error) {
	keyMutex.RLock()
	if privateKey != nil {
		defer keyMutex.RUnlock()
		return privateKey, nil
	}
	keyMutex.RUnlock()

	keyMutex.Lock()
	defer keyMutex.Unlock()

	if privateKey == nil {
		if err := initKeys(); err != nil {
			return nil, err
		}
	}

	return privateKey, nil
}

// GetKeyID 获取密钥ID
func GetKeyID() string {
	return keyID
}

// CheckSessionIframeHandler 会话检查iframe端点
// GET /check_session_iframe
func CheckSessionIframeHandler(c *fiber.Ctx) error {
	// TODO ⬇️ 实现One-Tap Auth的会话检查iframe
	html := `
<!DOCTYPE html>
<html>
<head>
    <title>BasaltPass Session Check</title>
</head>
<body>
	<script>
	        window.addEventListener('message', function(e) {
	            e.source.postMessage('unchanged', e.origin);
	        });
	    </script>
</body>
</html>
	`

	c.Set("Content-Type", "text/html")
	return c.SendString(html)
}

// EndSessionHandler 结束会话端点
// GET /end_session
func EndSessionHandler(c *fiber.Ctx) error {
	// TODO ⬇️ 实现会话注销逻辑
	return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{
		"error":             "not_implemented",
		"error_description": "End session endpoint - TODO ⬇️",
	})
}
