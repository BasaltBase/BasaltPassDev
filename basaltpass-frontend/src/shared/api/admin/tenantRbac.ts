import client from '@api/client'

export interface AdminTenantRbacRole {
  id: number
  code: string
  name: string
  description: string
  tenant_id: number
  is_system: boolean
  user_count: number
  created_at: string
  updated_at: string
}

export interface AdminTenantRbacPermission {
  id: number
  code: string
  name: string
  description: string
  category: string
  tenant_id: number
  created_at: string
  updated_at: string
}

export interface AdminTenantRbacUser {
  id: number
  email: string
  nickname: string
  role: string
  created_at: string
}

export interface AdminTenantRbacRolePayload {
  code: string
  name: string
  description: string
}

export interface AdminTenantRbacPermissionPayload {
  code: string
  name: string
  description: string
  category: string
}

export interface AdminTenantRbacUserAccess {
  user: AdminTenantRbacUser
  roles: AdminTenantRbacRole[]
  permissions: AdminTenantRbacPermission[]
}

export const adminTenantRbacApi = {
  async listRoles(tenantId: number, params: { search?: string } = {}): Promise<AdminTenantRbacRole[]> {
    const response = await client.get(`/api/v1/admin/tenants/${tenantId}/rbac/roles`, { params })
    return response.data.data.roles || []
  },

  async createRole(tenantId: number, data: AdminTenantRbacRolePayload): Promise<AdminTenantRbacRole> {
    const response = await client.post(`/api/v1/admin/tenants/${tenantId}/rbac/roles`, data)
    return response.data.data
  },

  async updateRole(tenantId: number, roleId: number, data: AdminTenantRbacRolePayload): Promise<AdminTenantRbacRole> {
    const response = await client.put(`/api/v1/admin/tenants/${tenantId}/rbac/roles/${roleId}`, data)
    return response.data.data
  },

  async deleteRole(tenantId: number, roleId: number): Promise<void> {
    await client.delete(`/api/v1/admin/tenants/${tenantId}/rbac/roles/${roleId}`)
  },

  async getRolePermissions(tenantId: number, roleId: number): Promise<AdminTenantRbacPermission[]> {
    const response = await client.get(`/api/v1/admin/tenants/${tenantId}/rbac/roles/${roleId}/permissions`)
    return response.data.data.permissions || []
  },

  async setRolePermissions(tenantId: number, roleId: number, permissionIds: number[]): Promise<void> {
    await client.post(`/api/v1/admin/tenants/${tenantId}/rbac/roles/${roleId}/permissions`, {
      permission_ids: permissionIds,
    })
  },

  async listPermissions(tenantId: number, params: { search?: string; category?: string } = {}): Promise<AdminTenantRbacPermission[]> {
    const response = await client.get(`/api/v1/admin/tenants/${tenantId}/rbac/permissions`, { params })
    return response.data.data.permissions || []
  },

  async createPermission(tenantId: number, data: AdminTenantRbacPermissionPayload): Promise<AdminTenantRbacPermission> {
    const response = await client.post(`/api/v1/admin/tenants/${tenantId}/rbac/permissions`, data)
    return response.data.data
  },

  async updatePermission(tenantId: number, permissionId: number, data: AdminTenantRbacPermissionPayload): Promise<AdminTenantRbacPermission> {
    const response = await client.put(`/api/v1/admin/tenants/${tenantId}/rbac/permissions/${permissionId}`, data)
    return response.data.data
  },

  async deletePermission(tenantId: number, permissionId: number): Promise<void> {
    await client.delete(`/api/v1/admin/tenants/${tenantId}/rbac/permissions/${permissionId}`)
  },

  async listUsers(tenantId: number, params: { search?: string } = {}): Promise<AdminTenantRbacUser[]> {
    const response = await client.get(`/api/v1/admin/tenants/${tenantId}/rbac/users`, { params })
    return response.data.data.users || []
  },

  async getUserAccess(tenantId: number, userId: number): Promise<AdminTenantRbacUserAccess> {
    const response = await client.get(`/api/v1/admin/tenants/${tenantId}/rbac/users/${userId}/access`)
    return response.data.data
  },

  async setUserAccess(tenantId: number, userId: number, roleIds: number[], permissionIds: number[]): Promise<void> {
    await client.put(`/api/v1/admin/tenants/${tenantId}/rbac/users/${userId}/access`, {
      role_ids: roleIds,
      permission_ids: permissionIds,
    })
  },
}

export default adminTenantRbacApi
