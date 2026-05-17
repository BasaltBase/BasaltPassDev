package oauth

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http/httptest"
	"strings"
	"testing"

	"basaltpass-backend/internal/common"
	"basaltpass-backend/internal/model"

	"crypto/sha256"
	"github.com/glebarez/sqlite"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

func setupOIDCE2EDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file::memory:?cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open sqlite failed: %v", err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.Tenant{}, &model.TenantUser{}, &model.App{}, &model.OAuthClient{}, &model.OAuthAuthorizationCode{}, &model.OAuthAccessToken{}, &model.OAuthRefreshToken{}); err != nil {
		t.Fatalf("auto migrate failed: %v", err)
	}
	common.SetDBForTest(db)
	return db
}

func TestOIDCAuthCodePKCEIssuesIDTokenAndJWKSVerifies(t *testing.T) {
	db := setupOIDCE2EDB(t)
	tenant := model.Tenant{Name: "OIDC Tenant", Code: "oidc", Status: model.TenantStatusActive}
	if err := db.Create(&tenant).Error; err != nil {
		t.Fatalf("create tenant: %v", err)
	}
	user := model.User{TenantID: tenant.ID, Email: "oidc@example.com", PasswordHash: "x", Nickname: "oidc-user"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("create user: %v", err)
	}
	app := model.App{TenantID: tenant.ID, Name: "OIDC App", Status: model.AppStatusActive}
	if err := db.Create(&app).Error; err != nil {
		t.Fatalf("create app: %v", err)
	}
	client := model.OAuthClient{AppID: app.ID, ClientID: "oidc-client", ClientSecret: "oidc-secret", RedirectURIs: "https://rp.example/callback", IsActive: true}
	if err := client.SetClientSecret("oidc-secret"); err != nil {
		t.Fatalf("set client secret: %v", err)
	}
	client.SetScopeList([]string{"openid", "profile", "email"})
	if err := db.Create(&client).Error; err != nil {
		t.Fatalf("create client: %v", err)
	}

	svc := NewOAuthServerService()
	verifier := "verifier-123"
	challenge := base64.RawURLEncoding.EncodeToString(sha256sum(verifier))
	authReq := &AuthorizeRequest{ClientID: client.ClientID, RedirectURI: "https://rp.example/callback", ResponseType: "code", Scope: "openid profile", CodeChallenge: challenge, CodeChallengeMethod: "S256", Nonce: "nonce-xyz"}
	code, err := svc.GenerateAuthorizationCode(user.ID, authReq, &client)
	if err != nil {
		t.Fatalf("generate code: %v", err)
	}
	resp, err := svc.ExchangeCodeForToken(&TokenRequest{GrantType: "authorization_code", Code: code, RedirectURI: authReq.RedirectURI, CodeVerifier: verifier}, client.ClientID, "oidc-secret")
	if err != nil {
		t.Fatalf("exchange token: %v", err)
	}
	if strings.TrimSpace(resp.IDToken) == "" {
		t.Fatalf("expected id_token for openid scope")
	}

	jwkPub := fetchRSAPublicKeyFromJWKS(t)
	token, err := jwt.Parse(resp.IDToken, func(token *jwt.Token) (interface{}, error) { return jwkPub, nil })
	if err != nil || !token.Valid {
		t.Fatalf("id_token verify failed by jwks key: %v", err)
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		t.Fatalf("unexpected claims type")
	}
	if claims["aud"] != client.ClientID || claims["nonce"] != "nonce-xyz" {
		t.Fatalf("unexpected aud/nonce claims: aud=%v nonce=%v", claims["aud"], claims["nonce"])
	}
}

func TestAuthorizeRequestRequiresNonceWhenOpenID(t *testing.T) {
	db := setupOIDCE2EDB(t)
	tenant := model.Tenant{Name: "N", Code: "n", Status: model.TenantStatusActive}
	_ = db.Create(&tenant).Error
	app := model.App{TenantID: tenant.ID, Name: "A", Status: model.AppStatusActive}
	_ = db.Create(&app).Error
	client := model.OAuthClient{AppID: app.ID, ClientID: "c1", RedirectURIs: "https://rp.example/cb", IsActive: true}
	client.SetScopeList([]string{"openid"})
	_ = db.Create(&client).Error

	svc := NewOAuthServerService()
	_, err := svc.ValidateAuthorizeRequest(&AuthorizeRequest{ClientID: "c1", RedirectURI: "https://rp.example/cb", ResponseType: "code", Scope: "openid"})
	if err == nil || err.Error() != "invalid_request" {
		t.Fatalf("expected invalid_request when openid scope has no nonce, got %v", err)
	}
}

func fetchRSAPublicKeyFromJWKS(t *testing.T) *rsa.PublicKey {
	t.Helper()
	app := fiber.New()
	app.Get("/oauth/jwks", JWKSHandler)
	req := httptest.NewRequest(fiber.MethodGet, "/oauth/jwks", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("jwks request failed: %v", err)
	}
	defer resp.Body.Close()
	var payload struct {
		Keys []map[string]string `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode jwks: %v", err)
	}
	if len(payload.Keys) == 0 {
		t.Fatalf("no keys in jwks")
	}
	nBytes, _ := base64.RawURLEncoding.DecodeString(payload.Keys[0]["n"])
	eBytes, _ := base64.RawURLEncoding.DecodeString(payload.Keys[0]["e"])
	return &rsa.PublicKey{N: new(big.Int).SetBytes(nBytes), E: int(new(big.Int).SetBytes(eBytes).Int64())}
}

func sha256sum(s string) []byte {
	h := sha256.Sum256([]byte(s))
	return h[:]
}
