# BasaltPass OIDC 改造方案（面向 OIDC Core 对齐）

> 目标：在保留现有 OAuth2 流程的前提下，将 BasaltPass 从“OAuth2 + 部分 OIDC 能力”升级为可稳定对接主流 OIDC Relying Party（RP）的实现。

## 1. 当前缺口（基于代码）

1. Token 响应未返回 `id_token`。
2. Discovery 宣告支持 `id_token` / `code id_token`，但授权端仅接受 `code`。
3. Discovery 中算法声明与实现能力存在偏差风险。
4. 缺少一套 OIDC 关键参数（nonce、at_hash、auth_time、acr/amr 等）的统一策略与测试矩阵。

---

## 2. 改造优先级（建议分 4 个阶段）

## Phase 1（必须）：补齐 OIDC 最小闭环

### 2.1 增加 ID Token 签发
- 在 `token` 端点授权码兑换成功后，生成并返回 `id_token`（JWT）。
- `id_token` 最少包含 claim：
  - `iss` / `sub` / `aud` / `exp` / `iat`
  - `auth_time`（建议）
  - `nonce`（当授权请求携带 nonce 时必须回传）
- 签名算法：建议先固定 `RS256`。

### 2.2 对齐授权请求参数
- `authorize` 请求中新增 OIDC 参数解析：`nonce`, `prompt`, `max_age`（先实现 `nonce` 必须项）。
- 当 `scope` 含 `openid` 时按 OIDC 规则处理。

### 2.3 统一 Discovery 声明
- 若暂不支持 implicit/hybrid，则 `response_types_supported` 只保留 `code`。
- `id_token_signing_alg_values_supported` 仅声明真实可用算法（例如 `RS256`）。

---

## Phase 2（推荐）：提升互操作性

### 2.4 UserInfo 与 Scope 映射
- `userinfo` claim 输出按 scope 控制：
  - `profile` -> `name/picture/preferred_username`
  - `email` -> `email/email_verified`
- 避免在 scope 不满足时返回超范围字段。

### 2.5 Token Endpoint Client Auth 细化
- 已有 `client_secret_basic` / `client_secret_post`，补充测试：
  - 缺失认证头
  - client_id 冲突
  - 公共客户端（PKCE-only）策略

### 2.6 错误码与错误描述规范化
- 统一 `invalid_request` / `invalid_grant` / `invalid_client` / `unsupported_response_type` / `invalid_scope`。
- 对 `WWW-Authenticate` 响应头做一致性处理。

---

## Phase 3（增强）：会话与登出能力

### 2.7 End Session 对齐
- 落地 `end_session_endpoint`：支持 `id_token_hint` / `post_logout_redirect_uri` / `state`。
- 明确前后端会话同步清理策略。

### 2.8 会话状态检查
- `check_session_iframe` 当前是占位，建议标记为实验能力或默认关闭，避免误导 RP。

---

## Phase 4（工程化）：可验证的“标准合规”

### 2.9 建立 OIDC 回归测试
- 新增集成测试（建议在 `test/auth` 下）：
  1. `openid` scope 的授权码流程，验证 token 响应包含 `id_token`
  2. 验签 `id_token`（通过 JWKS）
  3. 验证 `iss/aud/exp/iat/sub/nonce`
  4. discovery 声明与真实行为一致性检查

### 2.10 文档对齐
- README 与部署文档中明确：
  - 已支持的 response type
  - 已支持的签名算法
  - 公共客户端 PKCE 要求

---

## 3. 建议的代码落点

- 路由与端点：
  - `basaltpass-backend/internal/api/v1/routes/oauth.go`
- Discovery 与 JWKS：
  - `basaltpass-backend/internal/handler/public/oauth/discovery.go`
- 授权码与令牌交换主逻辑：
  - `basaltpass-backend/internal/handler/public/oauth/server_service.go`
  - `basaltpass-backend/internal/handler/public/oauth/server_handler.go`
- Token / Code 数据模型（如需持久化 nonce）：
  - `basaltpass-backend/internal/model/oauth_token.go`

---

## 4. 最小可上线变更（MVP）

如果你希望最快进入“可对接主流 OIDC 客户端”的状态，先做这 5 条：

1. TokenResponse 增加 `id_token` 并真实签发。
2. 授权请求处理 `nonce` 并回填到 ID Token。
3. Discovery response_types 改为仅 `code`（直到真的实现 hybrid/implicit）。
4. Discovery 签名算法改为仅声明 `RS256`。
5. 增加一条端到端自动化测试：`authorize(code+PKCE) -> token(含id_token) -> jwks验签`。

完成后，再逐步补充会话管理、logout 与更完整 claim 策略。
