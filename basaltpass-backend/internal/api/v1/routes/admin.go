package routes

import (
	admin2 "basaltpass-backend/internal/handler/admin"
	adminEmail "basaltpass-backend/internal/handler/admin/email"
	adminInvitation "basaltpass-backend/internal/handler/admin/invitation"
	adminNotification "basaltpass-backend/internal/handler/admin/notification"
	adminSettings "basaltpass-backend/internal/handler/admin/settings"
	adminTeam "basaltpass-backend/internal/handler/admin/team"
	adminTenant "basaltpass-backend/internal/handler/admin/tenant"
	adminUser "basaltpass-backend/internal/handler/admin/user"
	adminWallet "basaltpass-backend/internal/handler/admin/wallet"
	"basaltpass-backend/internal/handler/manualapi"
	appHandler "basaltpass-backend/internal/handler/public/app"
	"basaltpass-backend/internal/handler/public/app/app_user"
	"basaltpass-backend/internal/handler/public/oauth"
	"basaltpass-backend/internal/handler/public/rbac"
	"basaltpass-backend/internal/handler/public/subscription"
	"time"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

// InitAdminRouteDependencies 初始化管理员路由依赖
func InitAdminRouteDependencies(db *gorm.DB) {
	subscription.InitHandler(db)
}

// RegisterAdminRoutes 注册系统级管理员路由
func RegisterAdminRoutes(v1 fiber.Router) {
	// 原有的系统级管理员路由（保持向后兼容）
	adminGroup := v1.Group("/tenant", profileSuperAdminConsole()...)
	// 新增 /admin 前缀别名，逐步迁移
	adminAliasGroup := v1.Group("/admin", profileSuperAdminConsole()...)
	walletHandler := adminWallet.NewAdminWalletHandler()

	adminGroup.Get("/dashboard/stats", admin2.DashboardStatsHandler)        // /tenant/dashboard/stats
	adminGroup.Get("/dashboard/activities", admin2.RecentActivitiesHandler) // /tenant/dashboard/activities
	adminAliasGroup.Post("/liveness-check", func(c *fiber.Ctx) error {
		return c.Status(fiber.StatusOK).JSON(fiber.Map{
			"ok":         true,
			"scope":      "admin",
			"message":    "admin liveness check ok",
			"checked_at": time.Now().UTC().Format(time.RFC3339),
		})
	})
	adminGroup.Get("/roles", rbac.ListRolesHandler)           // /tenant/roles
	adminGroup.Post("/roles", rbac.CreateRoleHandler)         // /tenant/roles
	adminGroup.Post("/user/:id/role", rbac.AssignRoleHandler) // /tenant/user/:id/role

	// 权限管理（系统级）
	adminPermGroup := adminGroup.Group("/permissions")
	adminPermGroup.Get("/", rbac.ListPermissionsHandler)        // /tenant/permissions
	adminPermGroup.Post("/", rbac.CreatePermissionHandler)      // /tenant/permissions
	adminPermGroup.Put("/:id", rbac.UpdatePermissionHandler)    // /tenant/permissions/:id
	adminPermGroup.Delete("/:id", rbac.DeletePermissionHandler) // /tenant/permissions/:id

	// 角色-权限管理
	adminGroup.Get("/roles/:id/permissions", rbac.GetRolePermissionsHandler)                     // /tenant/roles/:id/permissions
	adminGroup.Post("/roles/:id/permissions", rbac.SetRolePermissionsHandler)                    // /tenant/roles/:id/permissions
	adminGroup.Delete("/roles/:id/permissions/:permission_id", rbac.RemoveRolePermissionHandler) // /tenant/roles/:id/permissions/:permission_id

	// 新的用户管理路由（替换原有的用户相关路由）
	adminUserGroup := adminGroup.Group("/users")
	adminUserGroup.Get("/", adminUser.ListUsersHandler)                             // /tenant/users
	adminUserGroup.Post("/", adminUser.CreateUserHandler)                           // /tenant/users
	adminUserGroup.Get("/stats", adminUser.GetUserStatsHandler)                     // /tenant/users/stats
	adminUserGroup.Get("/:id", adminUser.GetUserHandler)                            // /tenant/users/:id
	adminUserGroup.Get("/:id/summary", adminUser.GetUserSummaryHandler)             // /tenant/users/:id/summary
	adminUserGroup.Put("/:id", adminUser.UpdateUserHandler)                         // /tenant/users/:id
	adminUserGroup.Delete("/:id", adminUser.DeleteUserHandler)                      // /tenant/users/:id
	adminUserGroup.Post("/:id/ban", adminUser.BanUserHandler)                       // /tenant/users/:id/ban
	adminUserGroup.Post("/:id/roles", adminUser.AssignGlobalRoleHandler)            // /tenant/users/:id/roles
	adminUserGroup.Delete("/:id/roles/:role_id", adminUser.RemoveGlobalRoleHandler) // /tenant/users/:id/roles/:role_id

	// alias: /api/v1/admin/users 与 /api/v1/tenant/users 保持一致，便于前端迁移
	aliasUserGroup := adminAliasGroup.Group("/users")
	aliasUserGroup.Get("/", adminUser.ListUsersHandler)
	aliasUserGroup.Post("/", adminUser.CreateUserHandler)
	aliasUserGroup.Get("/stats", adminUser.GetUserStatsHandler)
	aliasUserGroup.Get("/:id", adminUser.GetUserHandler)
	aliasUserGroup.Get("/:id/summary", adminUser.GetUserSummaryHandler)
	aliasUserGroup.Put("/:id", adminUser.UpdateUserHandler)
	aliasUserGroup.Delete("/:id", adminUser.DeleteUserHandler)
	aliasUserGroup.Post("/:id/ban", adminUser.BanUserHandler)
	aliasUserGroup.Post("/:id/roles", adminUser.AssignGlobalRoleHandler)
	aliasUserGroup.Delete("/:id/roles/:role_id", adminUser.RemoveGlobalRoleHandler)

	// 新的租户管理路由
	adminTenantGroup := adminGroup.Group("/tenants")
	adminTenantGroup.Get("/", adminTenant.GetTenantListHandler)       // /tenant/tenants
	adminTenantGroup.Post("/", adminTenant.CreateTenantHandler)       // /tenant/tenants
	adminTenantGroup.Get("/stats", adminTenant.GetTenantStatsHandler) // /tenant/tenants/stats
	adminTenantGroup.Get("/:id", adminTenant.GetTenantDetailHandler)  // /tenant/tenants/:id
	adminTenantGroup.Put("/:id", adminTenant.UpdateTenantHandler)     // /tenant/tenants/:id
	adminTenantGroup.Delete("/:id", adminTenant.DeleteTenantHandler)  // /tenant/tenants/:id
	adminTenantGroup.Get("/:id/auth-settings", adminTenant.GetTenantAuthSettingsHandler)
	adminTenantGroup.Put("/:id/auth-settings", adminTenant.UpdateTenantAuthSettingsHandler)
	adminTenantGroup.Get("/:id/rbac/roles", adminTenant.AdminListTenantRbacRoles)
	adminTenantGroup.Post("/:id/rbac/roles", adminTenant.AdminCreateTenantRbacRole)
	adminTenantGroup.Put("/:id/rbac/roles/:roleId", adminTenant.AdminUpdateTenantRbacRole)
	adminTenantGroup.Delete("/:id/rbac/roles/:roleId", adminTenant.AdminDeleteTenantRbacRole)
	adminTenantGroup.Get("/:id/rbac/roles/:roleId/permissions", adminTenant.AdminGetTenantRbacRolePermissions)
	adminTenantGroup.Post("/:id/rbac/roles/:roleId/permissions", adminTenant.AdminSetTenantRbacRolePermissions)
	adminTenantGroup.Get("/:id/rbac/permissions", adminTenant.AdminListTenantRbacPermissions)
	adminTenantGroup.Post("/:id/rbac/permissions", adminTenant.AdminCreateTenantRbacPermission)
	adminTenantGroup.Put("/:id/rbac/permissions/:permissionId", adminTenant.AdminUpdateTenantRbacPermission)
	adminTenantGroup.Delete("/:id/rbac/permissions/:permissionId", adminTenant.AdminDeleteTenantRbacPermission)
	adminTenantGroup.Get("/:id/rbac/permission-categories", adminTenant.AdminListTenantRbacPermissionCategories)
	adminTenantGroup.Get("/:id/rbac/users", adminTenant.AdminListTenantRbacUsers)
	adminTenantGroup.Get("/:id/rbac/users/:userId/access", adminTenant.AdminGetTenantRbacUserAccess)
	adminTenantGroup.Put("/:id/rbac/users/:userId/access", adminTenant.AdminSetTenantRbacUserAccess)

	// alias: /api/v1/admin/tenants 与 /api/v1/tenant/tenants 对齐
	aliasTenantGroup := adminAliasGroup.Group("/tenants")
	aliasTenantGroup.Get("/", adminTenant.GetTenantListHandler)
	aliasTenantGroup.Post("/", adminTenant.CreateTenantHandler)
	aliasTenantGroup.Get("/stats", adminTenant.GetTenantStatsHandler)
	aliasTenantGroup.Get("/:id", adminTenant.GetTenantDetailHandler)
	aliasTenantGroup.Put("/:id", adminTenant.UpdateTenantHandler)
	aliasTenantGroup.Delete("/:id", adminTenant.DeleteTenantHandler)
	aliasTenantGroup.Get("/:id/auth-settings", adminTenant.GetTenantAuthSettingsHandler)
	aliasTenantGroup.Put("/:id/auth-settings", adminTenant.UpdateTenantAuthSettingsHandler)
	aliasTenantGroup.Get("/:id/rbac/roles", adminTenant.AdminListTenantRbacRoles)
	aliasTenantGroup.Post("/:id/rbac/roles", adminTenant.AdminCreateTenantRbacRole)
	aliasTenantGroup.Put("/:id/rbac/roles/:roleId", adminTenant.AdminUpdateTenantRbacRole)
	aliasTenantGroup.Delete("/:id/rbac/roles/:roleId", adminTenant.AdminDeleteTenantRbacRole)
	aliasTenantGroup.Get("/:id/rbac/roles/:roleId/permissions", adminTenant.AdminGetTenantRbacRolePermissions)
	aliasTenantGroup.Post("/:id/rbac/roles/:roleId/permissions", adminTenant.AdminSetTenantRbacRolePermissions)
	aliasTenantGroup.Get("/:id/rbac/permissions", adminTenant.AdminListTenantRbacPermissions)
	aliasTenantGroup.Post("/:id/rbac/permissions", adminTenant.AdminCreateTenantRbacPermission)
	aliasTenantGroup.Put("/:id/rbac/permissions/:permissionId", adminTenant.AdminUpdateTenantRbacPermission)
	aliasTenantGroup.Delete("/:id/rbac/permissions/:permissionId", adminTenant.AdminDeleteTenantRbacPermission)
	aliasTenantGroup.Get("/:id/rbac/permission-categories", adminTenant.AdminListTenantRbacPermissionCategories)
	aliasTenantGroup.Get("/:id/rbac/users", adminTenant.AdminListTenantRbacUsers)
	aliasTenantGroup.Get("/:id/rbac/users/:userId/access", adminTenant.AdminGetTenantRbacUserAccess)
	aliasTenantGroup.Put("/:id/rbac/users/:userId/access", adminTenant.AdminSetTenantRbacUserAccess)

	// 租户用户管理
	adminTenantGroup.Get("/:id/users", adminTenant.GetTenantUsersHandler)              // /tenant/tenants/:id/users
	adminTenantGroup.Get("/:id/users/:userId", adminTenant.GetTenantUserDetailHandler) // /tenant/tenants/:id/users/:userId
	adminTenantGroup.Delete("/:id/users/:userId", adminTenant.RemoveTenantUserHandler) // /tenant/tenants/:id/users/:userId
	adminTenantGroup.Post("/:tenantId/users/:id/wallets/adjust", walletHandler.AdjustTenantUserWallet)
	// alias 租户用户管理
	aliasTenantGroup.Get("/:id/users", adminTenant.GetTenantUsersHandler)
	aliasTenantGroup.Get("/:id/users/:userId", adminTenant.GetTenantUserDetailHandler)
	aliasTenantGroup.Delete("/:id/users/:userId", adminTenant.RemoveTenantUserHandler)
	aliasTenantGroup.Post("/:tenantId/users/:id/wallets/adjust", walletHandler.AdjustTenantUserWallet)

	// 钱包管理路由
	adminWalletGroup := adminGroup.Group("/wallets")
	adminWalletGroup.Get("/", walletHandler.ListWallets)                           // /tenant/wallets
	adminWalletGroup.Post("/", walletHandler.CreateWallet)                         // /tenant/wallets
	adminWalletGroup.Get("/stats", walletHandler.GetWalletStats)                   // /tenant/wallets/stats
	adminWalletGroup.Get("/:id", walletHandler.GetWallet)                          // /tenant/wallets/:id
	adminWalletGroup.Get("/:id/transactions", walletHandler.GetWalletTransactions) // /tenant/wallets/:id/transactions
	adminWalletGroup.Post("/:id/adjust", walletHandler.AdjustBalance)              // /tenant/wallets/:id/adjust
	adminWalletGroup.Post("/:id/freeze", walletHandler.FreezeWallet)               // /tenant/wallets/:id/freeze
	adminWalletGroup.Post("/:id/unfreeze", walletHandler.UnfreezeWallet)           // /tenant/wallets/:id/unfreeze
	adminWalletGroup.Delete("/:id", walletHandler.DeleteWallet)                    // /tenant/wallets/:id

	// 用户钱包管理
	adminGroup.Get("/users/:id/wallets", walletHandler.GetUserWallets) // /tenant/users/:id/wallets
	adminGroup.Post("/users/:id/wallets/adjust", walletHandler.AdjustUserWallet)
	adminGroup.Get("/gift-cards/:code", admin2.GetGiftCardValidityHandler)
	// alias user wallets
	adminAliasGroup.Get("/users/:id/wallets", walletHandler.GetUserWallets)
	adminAliasGroup.Post("/users/:id/wallets/adjust", walletHandler.AdjustUserWallet)
	adminAliasGroup.Get("/gift-cards/:code", admin2.GetGiftCardValidityHandler)

	// ===== 其它缺失的 /admin 别名路由补全 =====
	// Dashboard
	adminAliasGroup.Get("/dashboard/stats", admin2.DashboardStatsHandler)
	adminAliasGroup.Get("/dashboard/activities", admin2.RecentActivitiesHandler)

	// 角色与权限
	adminAliasGroup.Get("/roles", rbac.ListRolesHandler)
	adminAliasGroup.Post("/roles", rbac.CreateRoleHandler)
	adminAliasGroup.Post("/user/:id/role", rbac.AssignRoleHandler)

	aliasPermGroup := adminAliasGroup.Group("/permissions")
	aliasPermGroup.Get("/", rbac.ListPermissionsHandler)
	aliasPermGroup.Post("/", rbac.CreatePermissionHandler)
	aliasPermGroup.Put("/:id", rbac.UpdatePermissionHandler)
	aliasPermGroup.Delete("/:id", rbac.DeletePermissionHandler)

	adminAliasGroup.Get("/roles/:id/permissions", rbac.GetRolePermissionsHandler)
	adminAliasGroup.Post("/roles/:id/permissions", rbac.SetRolePermissionsHandler)
	adminAliasGroup.Delete("/roles/:id/permissions/:permission_id", rbac.RemoveRolePermissionHandler)

	// 钱包集合（原 /tenant/wallets）
	aliasWalletGroup := adminAliasGroup.Group("/wallets")
	aliasWalletGroup.Get("/", walletHandler.ListWallets)
	aliasWalletGroup.Post("/", walletHandler.CreateWallet)
	aliasWalletGroup.Get("/stats", walletHandler.GetWalletStats)
	aliasWalletGroup.Get("/:id", walletHandler.GetWallet)
	aliasWalletGroup.Get("/:id/transactions", walletHandler.GetWalletTransactions)
	aliasWalletGroup.Post("/:id/adjust", walletHandler.AdjustBalance)
	aliasWalletGroup.Post("/:id/freeze", walletHandler.FreezeWallet)
	aliasWalletGroup.Post("/:id/unfreeze", walletHandler.UnfreezeWallet)
	aliasWalletGroup.Delete("/:id", walletHandler.DeleteWallet)

	// 货币
	adminAliasGroup.Get("/currencies", walletHandler.GetCurrencies)
	// 初始化货币（按需/默认集）
	adminAliasGroup.Post("/currencies/init", walletHandler.InitCurrencies)

	// 设置
	aliasSettings := adminAliasGroup.Group("/settings")
	aliasSettings.Get("/", adminSettings.ListSettingsHandler)
	aliasSettings.Get("/:key", adminSettings.GetSettingHandler)
	aliasSettings.Post("/", adminSettings.UpsertSettingHandler)
	aliasSettings.Put("/bulk", adminSettings.BulkUpdateSettingsHandler)

	// OAuth Clients
	aliasOAuthClients := adminAliasGroup.Group("/oauth/clients")
	aliasOAuthClients.Post("/", oauth.CreateClientHandler)
	aliasOAuthClients.Get("/", oauth.ListClientsHandler)
	aliasOAuthClients.Get("/:client_id", oauth.GetClientHandler)
	aliasOAuthClients.Put("/:client_id", oauth.UpdateClientHandler)
	aliasOAuthClients.Delete("/:client_id", oauth.DeleteClientHandler)
	aliasOAuthClients.Post("/:client_id/regenerate-secret", oauth.RegenerateSecretHandler)
	aliasOAuthClients.Get("/:client_id/stats", oauth.GetClientStatsHandler)
	aliasOAuthClients.Get("/:client_id/tokens", oauth.GetTokensHandler)
	aliasOAuthClients.Post("/:client_id/revoke-tokens", oauth.RevokeClientTokensHandler)

	// Apps （系统级 + 应用用户管理）
	aliasApps := adminAliasGroup.Group("/apps")
	aliasApps.Post("/", appHandler.AdminCreateAppHandler)
	aliasApps.Get("/", appHandler.AdminListAppsHandler)
	aliasApps.Get("/:id", appHandler.AdminGetAppHandler)
	aliasApps.Put("/:id", appHandler.AdminUpdateAppHandler)
	aliasApps.Delete("/:id", appHandler.AdminDeleteAppHandler)
	aliasApps.Post("/", appHandler.CreateAppHandler)
	aliasApps.Get("/", appHandler.ListAppsHandler)
	aliasApps.Get("/:id", appHandler.GetAppHandler)
	aliasApps.Put("/:id", appHandler.UpdateAppHandler)
	aliasApps.Delete("/:id", appHandler.DeleteAppHandler)
	aliasApps.Patch("/:id/status", appHandler.ToggleAppStatusHandler)
	aliasApps.Get("/:id/stats", appHandler.GetAppStatsHandler)
	aliasApps.Get("/:app_id/users", app_user.GetAppUsersHandler)
	aliasApps.Get("/:app_id/users/stats", app_user.GetAppUserStatsHandler)
	aliasApps.Delete("/:app_id/users/:user_id", app_user.AdminRevokeUserAppHandler)
	aliasApps.Put("/:app_id/users/:user_id/status", app_user.UpdateAppUserStatusHandler)
	aliasApps.Get("/:app_id/users/by-status", app_user.GetAppUsersByStatusHandler)

	// Notifications
	aliasNotif := adminAliasGroup.Group("/notifications")
	aliasNotif.Post("/", adminNotification.AdminCreateHandler)
	aliasNotif.Get("/", adminNotification.AdminListHandler)
	aliasNotif.Delete("/:id", adminNotification.AdminDeleteHandler)

	// 订阅系统
	aliasProducts := adminAliasGroup.Group("/products")
	aliasProducts.Get("/", subscription.AdminListProductsHandler)
	aliasProducts.Get("/:id", subscription.AdminGetProductHandler)
	aliasProducts.Post("/", subscription.CreateProductHandler)
	aliasProducts.Put("/:id", subscription.UpdateProductHandler)
	aliasProducts.Delete("/:id", subscription.DeleteProductHandler)

	aliasPlans := adminAliasGroup.Group("/plans")
	aliasPlans.Get("/", subscription.AdminListPlansHandler)
	aliasPlans.Get("/:id", subscription.AdminGetPlanHandler)
	aliasPlans.Post("/", subscription.CreatePlanHandler)
	aliasPlans.Put("/:id", subscription.UpdatePlanHandler)
	aliasPlans.Delete("/:id", subscription.DeletePlanHandler)
	aliasPlans.Post("/features", subscription.CreatePlanFeatureHandler)

	aliasPrices := adminAliasGroup.Group("/prices")
	aliasPrices.Get("/", subscription.AdminListPricesHandler)
	aliasPrices.Get("/:id", subscription.AdminGetPriceHandler)
	aliasPrices.Post("/", subscription.CreatePriceHandler)
	aliasPrices.Put("/:id", subscription.UpdatePriceHandler)
	aliasPrices.Delete("/:id", subscription.DeletePriceHandler)

	aliasCoupons := adminAliasGroup.Group("/coupons")
	aliasCoupons.Get("/", subscription.AdminListCouponsHandler)
	aliasCoupons.Get("/:code", subscription.AdminGetCouponHandler)
	aliasCoupons.Post("/", subscription.CreateCouponHandler)
	aliasCoupons.Put("/:code", subscription.UpdateCouponHandler)
	aliasCoupons.Delete("/:code", subscription.DeleteCouponHandler)

	aliasSubscriptions := adminAliasGroup.Group("/subscriptions")
	aliasSubscriptions.Get("/", subscription.AdminListSubscriptionsHandler)
	aliasSubscriptions.Get("/:id", subscription.AdminGetSubscriptionHandler)
	aliasSubscriptions.Put("/:id/cancel", subscription.AdminCancelSubscriptionHandler)

	// 日志与旧钱包交易（兼容）
	adminAliasGroup.Get("/wallet-tx", admin2.ListWalletTxHandler)
	adminAliasGroup.Post("/tx/:id/approve", admin2.ApproveWalletTxHandler)
	adminAliasGroup.Get("/logs", admin2.ListAuditHandler)

	// 团队钱包管理
	adminGroup.Get("/teams/:id/wallets", walletHandler.GetTeamWallets) // /tenant/teams/:id/wallets
	adminGroup.Post("/teams/:id/wallets/adjust", walletHandler.AdjustTeamWallet)
	// 团队管理
	adminTeamGroup := adminGroup.Group("/teams")
	adminTeamGroup.Get("/", adminTeam.ListTeamsHandler)
	adminTeamGroup.Post("/", adminTeam.CreateTeamHandler)
	adminTeamGroup.Get("/:id", adminTeam.GetTeamHandler)
	adminTeamGroup.Put("/:id", adminTeam.UpdateTeamHandler)
	adminTeamGroup.Delete("/:id", adminTeam.DeleteTeamHandler)
	adminTeamGroup.Get("/:id/members", adminTeam.ListMembersHandler)
	adminTeamGroup.Post("/:id/members", adminTeam.AddMemberHandler)
	adminTeamGroup.Delete("/:id/members/:user_id", adminTeam.RemoveMemberHandler)
	adminTeamGroup.Put("/:id/members/:user_id/role", adminTeam.UpdateMemberRoleHandler)
	adminTeamGroup.Post("/:id/transfer/:new_owner_id", adminTeam.TransferOwnershipHandler)
	adminTeamGroup.Post("/:id/active", adminTeam.ToggleActiveHandler)

	// alias teams
	aliasTeams := adminAliasGroup.Group("/teams")
	aliasTeams.Get("/", adminTeam.ListTeamsHandler)
	aliasTeams.Post("/", adminTeam.CreateTeamHandler)
	aliasTeams.Get("/:id", adminTeam.GetTeamHandler)
	aliasTeams.Put("/:id", adminTeam.UpdateTeamHandler)
	aliasTeams.Delete("/:id", adminTeam.DeleteTeamHandler)
	aliasTeams.Get("/:id/members", adminTeam.ListMembersHandler)
	aliasTeams.Post("/:id/members", adminTeam.AddMemberHandler)
	aliasTeams.Delete("/:id/members/:user_id", adminTeam.RemoveMemberHandler)
	aliasTeams.Put("/:id/members/:user_id/role", adminTeam.UpdateMemberRoleHandler)
	aliasTeams.Post("/:id/transfer/:new_owner_id", adminTeam.TransferOwnershipHandler)
	aliasTeams.Post("/:id/active", adminTeam.ToggleActiveHandler)
	adminAliasGroup.Get("/teams/:id/wallets", walletHandler.GetTeamWallets)
	adminAliasGroup.Post("/teams/:id/wallets/adjust", walletHandler.AdjustTeamWallet)

	// 货币管理
	adminGroup.Get("/currencies", walletHandler.GetCurrencies) // /tenant/currencies
	// 初始化货币（按需/默认集）
	adminGroup.Post("/currencies/init", walletHandler.InitCurrencies)

	// 邀请管理
	adminInvitationGroup := adminGroup.Group("/invitations")
	adminInvitationGroup.Get("/", adminInvitation.ListInvitationsHandler)
	adminInvitationGroup.Post("/", adminInvitation.CreateInvitationHandler)
	adminInvitationGroup.Put("/:id/status", adminInvitation.UpdateInvitationStatusHandler)
	adminInvitationGroup.Delete("/:id", adminInvitation.DeleteInvitationHandler)

	// alias invitations
	aliasInv := adminAliasGroup.Group("/invitations")
	aliasInv.Get("/", adminInvitation.ListInvitationsHandler)
	aliasInv.Post("/", adminInvitation.CreateInvitationHandler)
	aliasInv.Put("/:id/status", adminInvitation.UpdateInvitationStatusHandler)
	aliasInv.Delete("/:id", adminInvitation.DeleteInvitationHandler)

	// 保留原有的钱包交易审批路由（向后兼容）
	adminGroup.Get("/wallet-tx", admin2.ListWalletTxHandler)          // /tenant/wallet-tx (deprecated, use /tenant/wallets instead)
	adminGroup.Post("/tx/:id/approve", admin2.ApproveWalletTxHandler) // /tenant/tx/:id/approve (deprecated)
	adminGroup.Get("/logs", admin2.ListAuditHandler)                  // /tenant/logs

	// 系统设置管理
	settingsGroup := adminGroup.Group("/settings")
	settingsGroup.Get("/", adminSettings.ListSettingsHandler)           // /tenant/settings
	settingsGroup.Get("/:key", adminSettings.GetSettingHandler)         // /tenant/settings/:key
	settingsGroup.Post("/", adminSettings.UpsertSettingHandler)         // /tenant/settings
	settingsGroup.Put("/bulk", adminSettings.BulkUpdateSettingsHandler) // /tenant/settings/bulk

	// OAuth2客户端管理路由（高级管理级）
	adminGroup.Get("/oauth/scopes", oauth.TenantListOAuthScopesHandler)
	oauthClientGroup := adminGroup.Group("/oauth/clients")                                // /tenant/oauth/clients
	oauthClientGroup.Post("/", oauth.CreateClientHandler)                                 // /tenant/oauth/clients
	oauthClientGroup.Get("/", oauth.ListClientsHandler)                                   // /tenant/oauth/clients
	oauthClientGroup.Get("/:client_id", oauth.GetClientHandler)                           // /tenant/oauth/clients/:client_id
	oauthClientGroup.Put("/:client_id", oauth.UpdateClientHandler)                        // /tenant/oauth/clients/:client_id
	oauthClientGroup.Delete("/:client_id", oauth.DeleteClientHandler)                     // /tenant/oauth/clients/:client_id
	oauthClientGroup.Post("/:client_id/regenerate-secret", oauth.RegenerateSecretHandler) // /tenant/oauth/clients/:client_id/regenerate-secret
	oauthClientGroup.Get("/:client_id/stats", oauth.GetClientStatsHandler)                // /tenant/oauth/clients/:client_id/stats
	oauthClientGroup.Get("/:client_id/tokens", oauth.GetTokensHandler)                    // /tenant/oauth/clients/:client_id/tokens
	oauthClientGroup.Post("/:client_id/revoke-tokens", oauth.RevokeClientTokensHandler)   // /tenant/oauth/clients/:client_id/revoke-tokens

	// 系统级应用管理
	adminAppGroup := adminGroup.Group("/apps")
	adminAppGroup.Post("/", appHandler.AdminCreateAppHandler)      // /tenant/apps
	adminAppGroup.Get("/", appHandler.AdminListAppsHandler)        // /tenant/apps
	adminAppGroup.Get("/:id", appHandler.AdminGetAppHandler)       // /tenant/apps/:id
	adminAppGroup.Put("/:id", appHandler.AdminUpdateAppHandler)    // /tenant/apps/:id
	adminAppGroup.Delete("/:id", appHandler.AdminDeleteAppHandler) // /tenant/apps/:id

	// 应用管理
	adminAppGroup.Post("/", appHandler.CreateAppHandler)
	adminAppGroup.Get("/", appHandler.ListAppsHandler)
	adminAppGroup.Get("/:id", appHandler.GetAppHandler)
	adminAppGroup.Put("/:id", appHandler.UpdateAppHandler)
	adminAppGroup.Delete("/:id", appHandler.DeleteAppHandler)
	adminAppGroup.Patch("/:id/status", appHandler.ToggleAppStatusHandler)
	adminAppGroup.Get("/:id/stats", appHandler.GetAppStatsHandler)

	// 应用用户管理路由（租户级）
	adminAppGroup.Get("/:app_id/users", app_user.GetAppUsersHandler)
	adminAppGroup.Get("/:app_id/users/stats", app_user.GetAppUserStatsHandler)
	adminAppGroup.Delete("/:app_id/users/:user_id", app_user.AdminRevokeUserAppHandler)

	// 新增：应用用户状态管理
	adminAppGroup.Put("/:app_id/users/:user_id/status", app_user.UpdateAppUserStatusHandler)
	adminAppGroup.Get("/:app_id/users/by-status", app_user.GetAppUsersByStatusHandler)

	// 管理员通知路由
	adminNotif := adminGroup.Group("/notifications")
	adminNotif.Post("/", adminNotification.AdminCreateHandler)      // /tenant/notifications
	adminNotif.Get("/", adminNotification.AdminListHandler)         // /tenant/notifications
	adminNotif.Delete("/:id", adminNotification.AdminDeleteHandler) // /tenant/notifications/:id

	// ========== 管理员订阅系统路由 ==========
	// 产品管理
	adminProductsGroup := adminGroup.Group("/products")
	adminProductsGroup.Get("/", subscription.AdminListProductsHandler)   // /tenant/products
	adminProductsGroup.Get("/:id", subscription.AdminGetProductHandler)  // /tenant/products/:id
	adminProductsGroup.Post("/", subscription.CreateProductHandler)      // /tenant/products
	adminProductsGroup.Put("/:id", subscription.UpdateProductHandler)    // /tenant/products/:id
	adminProductsGroup.Delete("/:id", subscription.DeleteProductHandler) // /tenant/products/:id

	// 套餐管理
	adminPlansGroup := adminGroup.Group("/plans")
	adminPlansGroup.Get("/", subscription.AdminListPlansHandler)             // /tenant/plans
	adminPlansGroup.Get("/:id", subscription.AdminGetPlanHandler)            // /tenant/plans/:id
	adminPlansGroup.Post("/", subscription.CreatePlanHandler)                // /tenant/plans
	adminPlansGroup.Put("/:id", subscription.UpdatePlanHandler)              // /tenant/plans/:id
	adminPlansGroup.Delete("/:id", subscription.DeletePlanHandler)           // /tenant/plans/:id
	adminPlansGroup.Post("/features", subscription.CreatePlanFeatureHandler) // /tenant/plans/features

	// 定价管理
	adminPricesGroup := adminGroup.Group("/prices")
	adminPricesGroup.Get("/", subscription.AdminListPricesHandler)   // /tenant/prices
	adminPricesGroup.Get("/:id", subscription.AdminGetPriceHandler)  // /tenant/prices/:id
	adminPricesGroup.Post("/", subscription.CreatePriceHandler)      // /tenant/prices
	adminPricesGroup.Put("/:id", subscription.UpdatePriceHandler)    // /tenant/prices/:id
	adminPricesGroup.Delete("/:id", subscription.DeletePriceHandler) // /tenant/prices/:id

	// 优惠券管理
	adminCouponsGroup := adminGroup.Group("/coupons")
	adminCouponsGroup.Get("/", subscription.AdminListCouponsHandler)     // /tenant/coupons
	adminCouponsGroup.Get("/:code", subscription.AdminGetCouponHandler)  // /tenant/coupons/:code
	adminCouponsGroup.Post("/", subscription.CreateCouponHandler)        // /tenant/coupons
	adminCouponsGroup.Put("/:code", subscription.UpdateCouponHandler)    // /tenant/coupons/:code
	adminCouponsGroup.Delete("/:code", subscription.DeleteCouponHandler) // /tenant/coupons/:code

	// 订阅管理
	adminSubscriptionsGroup := adminGroup.Group("/subscriptions")
	adminSubscriptionsGroup.Get("/", subscription.AdminListSubscriptionsHandler)            // /tenant/subscriptions
	adminSubscriptionsGroup.Get("/:id", subscription.AdminGetSubscriptionHandler)           // /tenant/subscriptions/:id
	adminSubscriptionsGroup.Put("/:id/cancel", subscription.AdminCancelSubscriptionHandler) // /tenant/subscriptions/:id/cancel

	// 邮件管理
	emailGroup := adminAliasGroup.Group("/email")
	emailGroup.Get("/config", adminEmail.GetEmailConfigHandler)
	emailGroup.Post("/send-test", adminEmail.SendTestEmailHandler)
	emailGroup.Get("/logs", adminEmail.GetEmailLogsHandler)
	emailGroup.Get("/stats", adminEmail.GetEmailStatsHandler)

	// 管理台手动 API Key 生成
	adminManualAPIGroup := adminAliasGroup.Group("/manual-api")
	adminManualAPIGroup.Post("/keys", manualapi.AdminCreateManualAPIKeyHandler)
}
