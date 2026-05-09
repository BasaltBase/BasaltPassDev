import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  KeyIcon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline'
import AdminLayout from '@features/admin/components/AdminLayout'
import { uiConfirm } from '@contexts/DialogContext'
import { ROUTES } from '@constants'
import { adminTenantApi, AdminTenantResponse } from '@api/admin/tenant'
import {
  adminTenantRbacApi,
  AdminTenantRbacPermission,
  AdminTenantRbacPermissionPayload,
  AdminTenantRbacRole,
  AdminTenantRbacRolePayload,
  AdminTenantRbacUser,
} from '@api/admin/tenantRbac'
import { Modal, PAlert, PBadge, PButton, PCard, PCheckbox, PInput, PPageHeader, PSelect, PSkeleton, PTextarea } from '@ui'

type TabKey = 'roles' | 'permissions' | 'users'

const emptyRoleForm: AdminTenantRbacRolePayload = {
  code: '',
  name: '',
  description: '',
}

const emptyPermissionForm: AdminTenantRbacPermissionPayload = {
  code: '',
  name: '',
  description: '',
  category: '',
}

export default function TenantRbac() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const routeTenantId = id ? Number(id) : 0
  const queryTenantId = Number(searchParams.get('tenant') || 0)
  const [selectedTenantId, setSelectedTenantId] = useState(routeTenantId || queryTenantId)
  const [tenants, setTenants] = useState<AdminTenantResponse[]>([])
  const [tenantName, setTenantName] = useState('')
  const [tab, setTab] = useState<TabKey>('roles')
  const [roles, setRoles] = useState<AdminTenantRbacRole[]>([])
  const [permissions, setPermissions] = useState<AdminTenantRbacPermission[]>([])
  const [users, setUsers] = useState<AdminTenantRbacUser[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<AdminTenantRbacRole | null>(null)
  const [roleForm, setRoleForm] = useState(emptyRoleForm)

  const [permissionModalOpen, setPermissionModalOpen] = useState(false)
  const [editingPermission, setEditingPermission] = useState<AdminTenantRbacPermission | null>(null)
  const [permissionForm, setPermissionForm] = useState(emptyPermissionForm)

  const [rolePermissionModalOpen, setRolePermissionModalOpen] = useState(false)
  const [permissionRole, setPermissionRole] = useState<AdminTenantRbacRole | null>(null)
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<number[]>([])

  const [userAccessModalOpen, setUserAccessModalOpen] = useState(false)
  const [accessUser, setAccessUser] = useState<AdminTenantRbacUser | null>(null)
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([])
  const [directPermissionIds, setDirectPermissionIds] = useState<number[]>([])

  useEffect(() => {
    if (!routeTenantId) {
      loadTenants()
    }
  }, [routeTenantId])

  useEffect(() => {
    if (routeTenantId) {
      setSelectedTenantId(routeTenantId)
    }
  }, [routeTenantId])

  useEffect(() => {
    if (selectedTenantId) {
      loadTenantContext(selectedTenantId)
    }
  }, [selectedTenantId])

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedTenantId),
    [tenants, selectedTenantId]
  )

  const groupedPermissions = useMemo(() => {
    return permissions.reduce<Record<string, AdminTenantRbacPermission[]>>((acc, permission) => {
      const category = permission.category || 'uncategorized'
      acc[category] = acc[category] || []
      acc[category].push(permission)
      return acc
    }, {})
  }, [permissions])

  const loadTenants = async () => {
    try {
      const response = await adminTenantApi.getTenantList({ page: 1, limit: 200 })
      setTenants(response.tenants || [])
      if (!selectedTenantId && response.tenants?.length) {
        setSelectedTenantId(response.tenants[0].id)
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load tenants')
    }
  }

  const loadTenantContext = async (tenantId: number) => {
    try {
      setLoading(true)
      setError(null)
      const [detail, roleList, permissionList, userList] = await Promise.all([
        adminTenantApi.getTenantDetail(tenantId),
        adminTenantRbacApi.listRoles(tenantId),
        adminTenantRbacApi.listPermissions(tenantId),
        adminTenantRbacApi.listUsers(tenantId),
      ])
      setTenantName(detail.name)
      setRoles(roleList)
      setPermissions(permissionList)
      setUsers(userList)
    } catch (err: any) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Failed to load tenant RBAC')
    } finally {
      setLoading(false)
    }
  }

  const showNotice = (message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2500)
  }

  const openRoleModal = (role?: AdminTenantRbacRole) => {
    setEditingRole(role || null)
    setRoleForm(role ? { code: role.code, name: role.name, description: role.description || '' } : emptyRoleForm)
    setRoleModalOpen(true)
  }

  const saveRole = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedTenantId) return
    try {
      setSaving(true)
      if (editingRole) {
        await adminTenantRbacApi.updateRole(selectedTenantId, editingRole.id, roleForm)
        showNotice('Role updated')
      } else {
        await adminTenantRbacApi.createRole(selectedTenantId, roleForm)
        showNotice('Role created')
      }
      setRoleModalOpen(false)
      await loadTenantContext(selectedTenantId)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save role')
    } finally {
      setSaving(false)
    }
  }

  const deleteRole = async (role: AdminTenantRbacRole) => {
    if (!selectedTenantId || !(await uiConfirm(`Delete role "${role.name}"?`))) return
    try {
      await adminTenantRbacApi.deleteRole(selectedTenantId, role.id)
      showNotice('Role deleted')
      await loadTenantContext(selectedTenantId)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete role')
    }
  }

  const openPermissionModal = (permission?: AdminTenantRbacPermission) => {
    setEditingPermission(permission || null)
    setPermissionForm(
      permission
        ? {
            code: permission.code,
            name: permission.name,
            description: permission.description || '',
            category: permission.category,
          }
        : emptyPermissionForm
    )
    setPermissionModalOpen(true)
  }

  const savePermission = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedTenantId) return
    try {
      setSaving(true)
      if (editingPermission) {
        await adminTenantRbacApi.updatePermission(selectedTenantId, editingPermission.id, permissionForm)
        showNotice('Permission updated')
      } else {
        await adminTenantRbacApi.createPermission(selectedTenantId, permissionForm)
        showNotice('Permission created')
      }
      setPermissionModalOpen(false)
      await loadTenantContext(selectedTenantId)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save permission')
    } finally {
      setSaving(false)
    }
  }

  const deletePermission = async (permission: AdminTenantRbacPermission) => {
    if (!selectedTenantId || !(await uiConfirm(`Delete permission "${permission.name}"?`))) return
    try {
      await adminTenantRbacApi.deletePermission(selectedTenantId, permission.id)
      showNotice('Permission deleted')
      await loadTenantContext(selectedTenantId)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete permission')
    }
  }

  const openRolePermissions = async (role: AdminTenantRbacRole) => {
    if (!selectedTenantId) return
    try {
      setPermissionRole(role)
      const rolePermissions = await adminTenantRbacApi.getRolePermissions(selectedTenantId, role.id)
      setSelectedPermissionIds(rolePermissions.map((permission) => permission.id))
      setRolePermissionModalOpen(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load role permissions')
    }
  }

  const saveRolePermissions = async () => {
    if (!selectedTenantId || !permissionRole) return
    try {
      setSaving(true)
      await adminTenantRbacApi.setRolePermissions(selectedTenantId, permissionRole.id, selectedPermissionIds)
      showNotice('Role permissions updated')
      setRolePermissionModalOpen(false)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save role permissions')
    } finally {
      setSaving(false)
    }
  }

  const openUserAccess = async (user: AdminTenantRbacUser) => {
    if (!selectedTenantId) return
    try {
      setAccessUser(user)
      const access = await adminTenantRbacApi.getUserAccess(selectedTenantId, user.id)
      setSelectedRoleIds(access.roles.map((role) => role.id))
      setDirectPermissionIds(access.permissions.map((permission) => permission.id))
      setUserAccessModalOpen(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load user access')
    }
  }

  const saveUserAccess = async () => {
    if (!selectedTenantId || !accessUser) return
    try {
      setSaving(true)
      await adminTenantRbacApi.setUserAccess(selectedTenantId, accessUser.id, selectedRoleIds, directPermissionIds)
      showNotice('User access updated')
      setUserAccessModalOpen(false)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save user access')
    } finally {
      setSaving(false)
    }
  }

  const toggleId = (ids: number[], id: number, checked: boolean) => {
    if (checked) {
      return ids.includes(id) ? ids : [...ids, id]
    }
    return ids.filter((existing) => existing !== id)
  }

  return (
    <AdminLayout title="Tenant Roles & Permissions">
      <div className="space-y-6">
        <PPageHeader
          title="Tenant Roles & Permissions"
          description={tenantName ? `Manage internal access for ${tenantName}` : 'Choose a tenant to manage internal RBAC'}
          icon={<ShieldCheckIcon className="h-8 w-8 text-indigo-600" />}
          actions={
            <div className="flex flex-wrap gap-2">
              {selectedTenantId ? (
                <PButton variant="secondary" onClick={() => navigate(`/admin/tenants/${selectedTenantId}`)}>
                  Tenant detail
                </PButton>
              ) : null}
            </div>
          }
        />

        {error ? <PAlert variant="error" title="Operation failed" message={error} /> : null}
        {notice ? <PAlert variant="success" title={notice} /> : null}

        {!routeTenantId ? (
          <PCard className="rounded-xl p-4 shadow-sm">
            <div className="grid gap-4 md:grid-cols-[minmax(240px,360px),1fr] md:items-end">
              <PSelect
                label="Tenant"
                value={selectedTenantId || ''}
                onChange={(event) => {
                  const tenantId = Number(event.target.value)
                  setSelectedTenantId(tenantId)
                  if (tenantId) {
                    navigate(`/admin/tenant-rbac?tenant=${tenantId}`, { replace: true })
                  }
                }}
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.code})
                  </option>
                ))}
              </PSelect>
              <div className="text-sm text-gray-500">
                {selectedTenant?.code ? `Code: ${selectedTenant.code}` : tenantName ? `Current tenant: ${tenantName}` : 'No tenant selected'}
              </div>
            </div>
          </PCard>
        ) : (
          <PCard className="rounded-xl p-4 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tenant context</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">{tenantName || `Tenant #${routeTenantId}`}</div>
                <div className="mt-1 text-xs text-gray-500">Tenant ID: {routeTenantId}</div>
              </div>
              <PButton variant="secondary" onClick={() => navigate(ROUTES.admin.tenants)}>
                Switch tenant
              </PButton>
            </div>
          </PCard>
        )}

        <div className="flex flex-wrap gap-2">
          {(['roles', 'permissions', 'users'] as TabKey[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === item ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50'
              }`}
            >
              {item === 'roles' ? 'Roles' : item === 'permissions' ? 'Permissions' : 'User assignment'}
            </button>
          ))}
        </div>

        {loading ? (
          <PCard className="rounded-xl p-6">
            <PSkeleton.List items={4} />
          </PCard>
        ) : (
          <>
            {tab === 'roles' ? (
              <RbacSection
                title="Roles"
                action={<PButton leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => openRoleModal()}>Create role</PButton>}
              >
                <div className="divide-y divide-gray-100">
                  {roles.map((role) => (
                    <div key={role.id} className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-gray-900">{role.name}</h3>
                          <PBadge variant={role.is_system ? 'purple' : 'info'}>{role.is_system ? 'System' : 'Custom'}</PBadge>
                        </div>
                        <p className="mt-1 text-xs font-mono text-gray-500">{role.code}</p>
                        {role.description ? <p className="mt-1 text-sm text-gray-600">{role.description}</p> : null}
                        <p className="mt-1 text-xs text-gray-400">{role.user_count || 0} users</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <PButton size="sm" variant="secondary" onClick={() => openRolePermissions(role)} leftIcon={<KeyIcon className="h-4 w-4" />}>Permissions</PButton>
                        <PButton size="sm" variant="ghost" onClick={() => openRoleModal(role)} leftIcon={<PencilIcon className="h-4 w-4" />}>Edit</PButton>
                        {!role.is_system ? (
                          <PButton size="sm" variant="danger" onClick={() => deleteRole(role)} leftIcon={<TrashIcon className="h-4 w-4" />}>Delete</PButton>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {roles.length === 0 ? <EmptyLine text="No roles yet" /> : null}
                </div>
              </RbacSection>
            ) : null}

            {tab === 'permissions' ? (
              <RbacSection
                title="Permissions"
                action={<PButton leftIcon={<PlusIcon className="h-4 w-4" />} onClick={() => openPermissionModal()}>Create permission</PButton>}
              >
                <div className="space-y-5">
                  {Object.entries(groupedPermissions).map(([category, items]) => (
                    <div key={category}>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{category}</h3>
                      <div className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                        {items.map((permission) => (
                          <div key={permission.id} className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{permission.name}</p>
                              <p className="mt-1 text-xs font-mono text-gray-500">{permission.code}</p>
                              {permission.description ? <p className="mt-1 text-sm text-gray-600">{permission.description}</p> : null}
                            </div>
                            <div className="flex gap-2">
                              <PButton size="sm" variant="ghost" onClick={() => openPermissionModal(permission)} leftIcon={<PencilIcon className="h-4 w-4" />}>Edit</PButton>
                              <PButton size="sm" variant="danger" onClick={() => deletePermission(permission)} leftIcon={<TrashIcon className="h-4 w-4" />}>Delete</PButton>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {permissions.length === 0 ? <EmptyLine text="No permissions yet" /> : null}
                </div>
              </RbacSection>
            ) : null}

            {tab === 'users' ? (
              <RbacSection title="Assign roles and direct permissions">
                <div className="divide-y divide-gray-100">
                  {users.map((user) => (
                    <div key={user.id} className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-3">
                        <UserCircleIcon className="h-9 w-9 text-gray-400" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{user.nickname || user.email}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                          <PBadge variant="default" className="mt-2">{user.role}</PBadge>
                        </div>
                      </div>
                      <PButton size="sm" onClick={() => openUserAccess(user)}>Manage access</PButton>
                    </div>
                  ))}
                  {users.length === 0 ? <EmptyLine text="No tenant users yet" /> : null}
                </div>
              </RbacSection>
            ) : null}
          </>
        )}
      </div>

      <Modal
        open={roleModalOpen}
        title={editingRole ? 'Edit role' : 'Create role'}
        onClose={() => setRoleModalOpen(false)}
        footer={<FormFooter saving={saving} onCancel={() => setRoleModalOpen(false)} submitLabel={editingRole ? 'Save role' : 'Create role'} form="tenant-rbac-role-form" />}
      >
        <form id="tenant-rbac-role-form" className="space-y-4" onSubmit={saveRole}>
          <PInput label="Code" value={roleForm.code} onChange={(event) => setRoleForm({ ...roleForm, code: event.target.value })} required />
          <PInput label="Name" value={roleForm.name} onChange={(event) => setRoleForm({ ...roleForm, name: event.target.value })} required />
          <PTextarea label="Description" value={roleForm.description} onChange={(event) => setRoleForm({ ...roleForm, description: event.target.value })} rows={3} />
        </form>
      </Modal>

      <Modal
        open={permissionModalOpen}
        title={editingPermission ? 'Edit permission' : 'Create permission'}
        onClose={() => setPermissionModalOpen(false)}
        footer={<FormFooter saving={saving} onCancel={() => setPermissionModalOpen(false)} submitLabel={editingPermission ? 'Save permission' : 'Create permission'} form="tenant-rbac-permission-form" />}
      >
        <form id="tenant-rbac-permission-form" className="space-y-4" onSubmit={savePermission}>
          <PInput label="Code" value={permissionForm.code} onChange={(event) => setPermissionForm({ ...permissionForm, code: event.target.value })} required />
          <PInput label="Name" value={permissionForm.name} onChange={(event) => setPermissionForm({ ...permissionForm, name: event.target.value })} required />
          <PInput label="Category" value={permissionForm.category} onChange={(event) => setPermissionForm({ ...permissionForm, category: event.target.value })} required />
          <PTextarea label="Description" value={permissionForm.description} onChange={(event) => setPermissionForm({ ...permissionForm, description: event.target.value })} rows={3} />
        </form>
      </Modal>

      <Modal
        open={rolePermissionModalOpen}
        title={permissionRole ? `Permissions for ${permissionRole.name}` : 'Role permissions'}
        onClose={() => setRolePermissionModalOpen(false)}
        widthClass="max-w-3xl"
        footer={
          <div className="flex justify-end gap-3">
            <PButton type="button" variant="secondary" onClick={() => setRolePermissionModalOpen(false)}>Cancel</PButton>
            <PButton type="button" loading={saving} onClick={saveRolePermissions}>Save permissions</PButton>
          </div>
        }
      >
        <PermissionChecklist
          groupedPermissions={groupedPermissions}
          selectedIds={selectedPermissionIds}
          onChange={(permissionId, checked) => setSelectedPermissionIds((ids) => toggleId(ids, permissionId, checked))}
        />
      </Modal>

      <Modal
        open={userAccessModalOpen}
        title={accessUser ? `Access for ${accessUser.nickname || accessUser.email}` : 'User access'}
        onClose={() => setUserAccessModalOpen(false)}
        widthClass="max-w-4xl"
        footer={
          <div className="flex justify-end gap-3">
            <PButton type="button" variant="secondary" onClick={() => setUserAccessModalOpen(false)}>Cancel</PButton>
            <PButton type="button" loading={saving} onClick={saveUserAccess}>Save access</PButton>
          </div>
        }
      >
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Roles</h3>
            <div className="space-y-3">
              {roles.map((role) => (
                <PCheckbox
                  key={role.id}
                  label={`${role.name} (${role.code})`}
                  checked={selectedRoleIds.includes(role.id)}
                  onChange={(event) => setSelectedRoleIds((ids) => toggleId(ids, role.id, (event.target as HTMLInputElement).checked))}
                />
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900">Direct permissions</h3>
            <PermissionChecklist
              groupedPermissions={groupedPermissions}
              selectedIds={directPermissionIds}
              onChange={(permissionId, checked) => setDirectPermissionIds((ids) => toggleId(ids, permissionId, checked))}
            />
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}

function RbacSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <PCard className="rounded-xl p-0 shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-2">{children}</div>
    </PCard>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <div className="py-10 text-center text-sm text-gray-500">{text}</div>
}

function FormFooter({ saving, onCancel, submitLabel, form }: { saving: boolean; onCancel: () => void; submitLabel: string; form: string }) {
  return (
    <div className="flex justify-end gap-3">
      <PButton type="button" variant="secondary" onClick={onCancel}>Cancel</PButton>
      <PButton type="submit" form={form} loading={saving}>{submitLabel}</PButton>
    </div>
  )
}

function PermissionChecklist({
  groupedPermissions,
  selectedIds,
  onChange,
}: {
  groupedPermissions: Record<string, AdminTenantRbacPermission[]>
  selectedIds: number[]
  onChange: (permissionId: number, checked: boolean) => void
}) {
  return (
    <div className="space-y-4">
      {Object.entries(groupedPermissions).map(([category, permissions]) => (
        <div key={category}>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{category}</h4>
          <div className="space-y-2 rounded-lg border border-gray-100 p-3">
            {permissions.map((permission) => (
              <PCheckbox
                key={permission.id}
                label={`${permission.name} (${permission.code})`}
                checked={selectedIds.includes(permission.id)}
                onChange={(event) => onChange(permission.id, (event.target as HTMLInputElement).checked)}
              />
            ))}
          </div>
        </div>
      ))}
      {Object.keys(groupedPermissions).length === 0 ? <EmptyLine text="No permissions available" /> : null}
    </div>
  )
}
