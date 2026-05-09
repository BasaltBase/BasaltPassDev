package tenant

import (
	"errors"
	"math"
	"strconv"
	"strings"
	"time"

	"basaltpass-backend/internal/common"
	"basaltpass-backend/internal/model"

	"github.com/gofiber/fiber/v2"
	"gorm.io/gorm"
)

type tenantRbacRoleRequest struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type tenantRbacPermissionRequest struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Category    string `json:"category"`
}

type tenantRbacPermissionIDsRequest struct {
	PermissionIDs []uint `json:"permission_ids"`
}

type tenantRbacUserAccessRequest struct {
	RoleIDs       []uint `json:"role_ids"`
	PermissionIDs []uint `json:"permission_ids"`
}

type tenantRbacRoleResponse struct {
	model.TenantRbacRole
	UserCount int64 `json:"user_count"`
}

type tenantRbacUserAccessResponse struct {
	User        tenantRbacUserSummary        `json:"user"`
	Roles       []model.TenantRbacRole       `json:"roles"`
	Permissions []model.TenantRbacPermission `json:"permissions"`
}

type tenantRbacUserSummary struct {
	ID        uint      `json:"id"`
	Email     string    `json:"email"`
	Nickname  string    `json:"nickname"`
	Role      string    `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}

func parseTenantID(c *fiber.Ctx) (uint, error) {
	id, err := strconv.ParseUint(c.Params("id"), 10, 32)
	return uint(id), err
}

func parseUintParam(c *fiber.Ctx, key string) (uint, error) {
	id, err := strconv.ParseUint(c.Params(key), 10, 32)
	return uint(id), err
}

func currentAdminID(c *fiber.Ctx) uint {
	switch v := c.Locals("userID").(type) {
	case uint:
		return v
	case uint64:
		return uint(v)
	case int:
		if v > 0 {
			return uint(v)
		}
	case float64:
		if v > 0 {
			return uint(v)
		}
	}
	return 0
}

func ensureTenantExists(tenantID uint) error {
	var count int64
	if err := common.DB().Model(&model.Tenant{}).Where("id = ?", tenantID).Count(&count).Error; err != nil {
		return err
	}
	if count == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func normalizeCode(value string) string {
	return strings.TrimSpace(strings.ToLower(value))
}

func validateRoleRequest(req tenantRbacRoleRequest) error {
	if normalizeCode(req.Code) == "" || strings.TrimSpace(req.Name) == "" {
		return errors.New("角色代码和名称必填")
	}
	return nil
}

func validatePermissionRequest(req tenantRbacPermissionRequest) error {
	if normalizeCode(req.Code) == "" || strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.Category) == "" {
		return errors.New("权限代码、名称和分类必填")
	}
	return nil
}

// AdminListTenantRbacRoles lists internal tenant RBAC roles for a tenant.
func AdminListTenantRbacRoles(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}
	if err := ensureTenantExists(tenantID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "租户不存在"})
	}

	page, _ := strconv.Atoi(c.Query("page", "1"))
	pageSize, _ := strconv.Atoi(c.Query("page_size", c.Query("limit", "20")))
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}

	query := common.DB().Model(&model.TenantRbacRole{}).Where("tenant_id = ?", tenantID)
	if search := strings.TrimSpace(c.Query("search")); search != "" {
		like := "%" + search + "%"
		query = query.Where("code LIKE ? OR name LIKE ? OR description LIKE ?", like, like, like)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "获取角色统计失败"})
	}

	var roles []model.TenantRbacRole
	if err := query.Order("is_system DESC, created_at DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&roles).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "获取角色列表失败"})
	}

	responses := make([]tenantRbacRoleResponse, 0, len(roles))
	for _, role := range roles {
		var count int64
		common.DB().Model(&model.TenantUserRbacRole{}).Where("tenant_id = ? AND role_id = ?", tenantID, role.ID).Count(&count)
		responses = append(responses, tenantRbacRoleResponse{TenantRbacRole: role, UserCount: count})
	}

	return c.JSON(fiber.Map{
		"data": fiber.Map{
			"roles": responses,
			"pagination": fiber.Map{
				"page":        page,
				"page_size":   pageSize,
				"total":       total,
				"total_pages": int(math.Ceil(float64(total) / float64(pageSize))),
			},
		},
	})
}

func AdminCreateTenantRbacRole(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}
	if err := ensureTenantExists(tenantID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "租户不存在"})
	}

	var req tenantRbacRoleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请求参数错误"})
	}
	if err := validateRoleRequest(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	role := model.TenantRbacRole{
		TenantID:    tenantID,
		Code:        normalizeCode(req.Code),
		Name:        strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description),
	}
	if err := common.DB().Create(&role).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "创建角色失败"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": role, "message": "角色创建成功"})
}

func AdminUpdateTenantRbacRole(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}
	roleID, err := parseUintParam(c, "roleId")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的角色ID"})
	}

	var req tenantRbacRoleRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请求参数错误"})
	}
	if err := validateRoleRequest(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	var role model.TenantRbacRole
	if err := common.DB().Where("id = ? AND tenant_id = ?", roleID, tenantID).First(&role).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "角色不存在"})
	}
	if role.IsSystem && role.Code != normalizeCode(req.Code) {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "系统角色代码不可修改"})
	}

	role.Code = normalizeCode(req.Code)
	role.Name = strings.TrimSpace(req.Name)
	role.Description = strings.TrimSpace(req.Description)
	if err := common.DB().Save(&role).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "更新角色失败"})
	}
	return c.JSON(fiber.Map{"data": role, "message": "角色更新成功"})
}

func AdminDeleteTenantRbacRole(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}
	roleID, err := parseUintParam(c, "roleId")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的角色ID"})
	}

	var role model.TenantRbacRole
	if err := common.DB().Where("id = ? AND tenant_id = ?", roleID, tenantID).First(&role).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "角色不存在"})
	}
	if role.IsSystem {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "系统角色不可删除"})
	}

	if err := common.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("role_id = ?", roleID).Delete(&model.TenantRbacRolePermission{}).Error; err != nil {
			return err
		}
		if err := tx.Where("tenant_id = ? AND role_id = ?", tenantID, roleID).Delete(&model.TenantUserRbacRole{}).Error; err != nil {
			return err
		}
		return tx.Delete(&role).Error
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "删除角色失败"})
	}

	return c.JSON(fiber.Map{"message": "角色删除成功"})
}

func AdminListTenantRbacPermissions(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}
	if err := ensureTenantExists(tenantID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "租户不存在"})
	}

	query := common.DB().Model(&model.TenantRbacPermission{}).Where("tenant_id = ?", tenantID)
	if search := strings.TrimSpace(c.Query("search")); search != "" {
		like := "%" + search + "%"
		query = query.Where("code LIKE ? OR name LIKE ? OR description LIKE ?", like, like, like)
	}
	if category := strings.TrimSpace(c.Query("category")); category != "" {
		query = query.Where("category = ?", category)
	}

	var permissions []model.TenantRbacPermission
	if err := query.Order("category ASC, code ASC").Find(&permissions).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "获取权限列表失败"})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"permissions": permissions}})
}

func AdminCreateTenantRbacPermission(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}
	if err := ensureTenantExists(tenantID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "租户不存在"})
	}

	var req tenantRbacPermissionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请求参数错误"})
	}
	if err := validatePermissionRequest(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	permission := model.TenantRbacPermission{
		TenantID:    tenantID,
		Code:        normalizeCode(req.Code),
		Name:        strings.TrimSpace(req.Name),
		Description: strings.TrimSpace(req.Description),
		Category:    strings.TrimSpace(req.Category),
	}
	if err := common.DB().Create(&permission).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "创建权限失败"})
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"data": permission, "message": "权限创建成功"})
}

func AdminUpdateTenantRbacPermission(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}
	permissionID, err := parseUintParam(c, "permissionId")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的权限ID"})
	}

	var req tenantRbacPermissionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请求参数错误"})
	}
	if err := validatePermissionRequest(req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": err.Error()})
	}

	var permission model.TenantRbacPermission
	if err := common.DB().Where("id = ? AND tenant_id = ?", permissionID, tenantID).First(&permission).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "权限不存在"})
	}

	permission.Code = normalizeCode(req.Code)
	permission.Name = strings.TrimSpace(req.Name)
	permission.Description = strings.TrimSpace(req.Description)
	permission.Category = strings.TrimSpace(req.Category)
	if err := common.DB().Save(&permission).Error; err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "更新权限失败"})
	}
	return c.JSON(fiber.Map{"data": permission, "message": "权限更新成功"})
}

func AdminDeleteTenantRbacPermission(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}
	permissionID, err := parseUintParam(c, "permissionId")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的权限ID"})
	}

	var permission model.TenantRbacPermission
	if err := common.DB().Where("id = ? AND tenant_id = ?", permissionID, tenantID).First(&permission).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "权限不存在"})
	}

	if err := common.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("permission_id = ?", permissionID).Delete(&model.TenantRbacRolePermission{}).Error; err != nil {
			return err
		}
		if err := tx.Where("tenant_id = ? AND permission_id = ?", tenantID, permissionID).Delete(&model.TenantUserRbacPermission{}).Error; err != nil {
			return err
		}
		return tx.Delete(&permission).Error
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "删除权限失败"})
	}

	return c.JSON(fiber.Map{"message": "权限删除成功"})
}

func AdminListTenantRbacPermissionCategories(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}
	var categories []string
	if err := common.DB().Model(&model.TenantRbacPermission{}).
		Where("tenant_id = ?", tenantID).
		Distinct("category").
		Order("category ASC").
		Pluck("category", &categories).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "获取权限分类失败"})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"categories": categories}})
}

func AdminGetTenantRbacRolePermissions(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}
	roleID, err := parseUintParam(c, "roleId")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的角色ID"})
	}
	var role model.TenantRbacRole
	if err := common.DB().Where("id = ? AND tenant_id = ?", roleID, tenantID).First(&role).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "角色不存在"})
	}

	var permissions []model.TenantRbacPermission
	if err := common.DB().
		Joins("JOIN tenant_role_permissions ON tenant_role_permissions.permission_id = tenant_permissions.id").
		Where("tenant_role_permissions.role_id = ? AND tenant_permissions.tenant_id = ?", roleID, tenantID).
		Order("tenant_permissions.category ASC, tenant_permissions.code ASC").
		Find(&permissions).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "获取角色权限失败"})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"permissions": permissions}})
}

func AdminSetTenantRbacRolePermissions(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}
	roleID, err := parseUintParam(c, "roleId")
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的角色ID"})
	}

	var req tenantRbacPermissionIDsRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请求参数错误"})
	}

	var role model.TenantRbacRole
	if err := common.DB().Where("id = ? AND tenant_id = ?", roleID, tenantID).First(&role).Error; err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "角色不存在"})
	}

	var permissions []model.TenantRbacPermission
	if len(req.PermissionIDs) > 0 {
		if err := common.DB().Where("tenant_id = ? AND id IN ?", tenantID, req.PermissionIDs).Find(&permissions).Error; err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "验证权限失败"})
		}
		if len(permissions) != len(uniqueUintIDs(req.PermissionIDs)) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "包含无效权限"})
		}
	}

	if err := common.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("role_id = ?", roleID).Delete(&model.TenantRbacRolePermission{}).Error; err != nil {
			return err
		}
		for _, permission := range permissions {
			if err := tx.Create(&model.TenantRbacRolePermission{RoleID: roleID, PermissionID: permission.ID}).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "保存角色权限失败"})
	}
	return c.JSON(fiber.Map{"message": "角色权限已更新"})
}

func AdminListTenantRbacUsers(c *fiber.Ctx) error {
	tenantID, err := parseTenantID(c)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
	}

	query := common.DB().Model(&model.TenantUser{}).Where("tenant_id = ?", tenantID).Preload("User")
	if search := strings.TrimSpace(c.Query("search")); search != "" {
		like := "%" + search + "%"
		query = query.Joins("JOIN system_auth_users ON system_auth_users.id = tenant_users.user_id").
			Where("system_auth_users.email LIKE ? OR system_auth_users.nickname LIKE ?", like, like)
	}

	var records []model.TenantUser
	if err := query.Order("created_at DESC").Limit(200).Find(&records).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "获取租户用户失败"})
	}
	users := make([]tenantRbacUserSummary, 0, len(records))
	for _, record := range records {
		users = append(users, tenantRbacUserSummary{
			ID:        record.UserID,
			Email:     record.User.Email,
			Nickname:  record.User.Nickname,
			Role:      string(record.Role),
			CreatedAt: record.CreatedAt,
		})
	}
	return c.JSON(fiber.Map{"data": fiber.Map{"users": users}})
}

func AdminGetTenantRbacUserAccess(c *fiber.Ctx) error {
	tenantID, userID, ok := parseTenantUserAccessParams(c)
	if !ok {
		return nil
	}
	user, err := getTenantRbacUser(tenantID, userID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "租户用户不存在"})
	}

	var roles []model.TenantRbacRole
	if err := common.DB().
		Joins("JOIN tenant_user_roles ON tenant_user_roles.role_id = tenant_roles.id").
		Where("tenant_user_roles.tenant_id = ? AND tenant_user_roles.user_id = ?", tenantID, userID).
		Where("tenant_user_roles.expires_at IS NULL OR tenant_user_roles.expires_at > ?", time.Now()).
		Order("tenant_roles.name ASC").
		Find(&roles).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "获取用户角色失败"})
	}

	var permissions []model.TenantRbacPermission
	if err := common.DB().
		Joins("JOIN tenant_user_permissions ON tenant_user_permissions.permission_id = tenant_permissions.id").
		Where("tenant_user_permissions.tenant_id = ? AND tenant_user_permissions.user_id = ?", tenantID, userID).
		Where("tenant_user_permissions.expires_at IS NULL OR tenant_user_permissions.expires_at > ?", time.Now()).
		Order("tenant_permissions.category ASC, tenant_permissions.code ASC").
		Find(&permissions).Error; err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "获取用户权限失败"})
	}

	return c.JSON(fiber.Map{"data": tenantRbacUserAccessResponse{User: user, Roles: roles, Permissions: permissions}})
}

func AdminSetTenantRbacUserAccess(c *fiber.Ctx) error {
	tenantID, userID, ok := parseTenantUserAccessParams(c)
	if !ok {
		return nil
	}
	if _, err := getTenantRbacUser(tenantID, userID); err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "租户用户不存在"})
	}

	var req tenantRbacUserAccessRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "请求参数错误"})
	}

	roleIDs := uniqueUintIDs(req.RoleIDs)
	permissionIDs := uniqueUintIDs(req.PermissionIDs)
	if len(roleIDs) > 0 {
		var count int64
		if err := common.DB().Model(&model.TenantRbacRole{}).Where("tenant_id = ? AND id IN ?", tenantID, roleIDs).Count(&count).Error; err != nil || count != int64(len(roleIDs)) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "包含无效角色"})
		}
	}
	if len(permissionIDs) > 0 {
		var count int64
		if err := common.DB().Model(&model.TenantRbacPermission{}).Where("tenant_id = ? AND id IN ?", tenantID, permissionIDs).Count(&count).Error; err != nil || count != int64(len(permissionIDs)) {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "包含无效权限"})
		}
	}

	actorID := currentAdminID(c)
	if err := common.DB().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tenant_id = ? AND user_id = ?", tenantID, userID).Delete(&model.TenantUserRbacRole{}).Error; err != nil {
			return err
		}
		for _, roleID := range roleIDs {
			if err := tx.Create(&model.TenantUserRbacRole{
				UserID:     userID,
				TenantID:   tenantID,
				RoleID:     roleID,
				AssignedAt: time.Now(),
				AssignedBy: actorID,
			}).Error; err != nil {
				return err
			}
		}

		if err := tx.Where("tenant_id = ? AND user_id = ?", tenantID, userID).Delete(&model.TenantUserRbacPermission{}).Error; err != nil {
			return err
		}
		for _, permissionID := range permissionIDs {
			if err := tx.Create(&model.TenantUserRbacPermission{
				UserID:       userID,
				TenantID:     tenantID,
				PermissionID: permissionID,
				GrantedAt:    time.Now(),
				GrantedBy:    actorID,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "保存用户权限失败"})
	}

	return c.JSON(fiber.Map{"message": "用户访问权限已更新"})
}

func parseTenantUserAccessParams(c *fiber.Ctx) (uint, uint, bool) {
	tenantID, err := parseTenantID(c)
	if err != nil {
		_ = c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的租户ID"})
		return 0, 0, false
	}
	userID, err := parseUintParam(c, "userId")
	if err != nil {
		_ = c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "无效的用户ID"})
		return 0, 0, false
	}
	return tenantID, userID, true
}

func getTenantRbacUser(tenantID uint, userID uint) (tenantRbacUserSummary, error) {
	var record model.TenantUser
	if err := common.DB().Preload("User").Where("tenant_id = ? AND user_id = ?", tenantID, userID).First(&record).Error; err != nil {
		return tenantRbacUserSummary{}, err
	}
	return tenantRbacUserSummary{
		ID:        record.UserID,
		Email:     record.User.Email,
		Nickname:  record.User.Nickname,
		Role:      string(record.Role),
		CreatedAt: record.CreatedAt,
	}, nil
}

func uniqueUintIDs(ids []uint) []uint {
	seen := map[uint]struct{}{}
	result := make([]uint, 0, len(ids))
	for _, id := range ids {
		if id == 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		result = append(result, id)
	}
	return result
}
