import { Route } from 'react-router-dom'
import TenantList from '@pages/admin/tenant/TenantList'
import CreateTenant from '@pages/admin/tenant/CreateTenant'
import TenantDetail from '@pages/admin/tenant/TenantDetail'
import EditTenant from '@pages/admin/tenant/EditTenant'
import TenantUsers from '@pages/admin/tenant/TenantUsers'
import TenantRbac from '@pages/admin/tenant/TenantRbac'
import { withAdmin } from '@/routes/helpers'

export function AdminTenantRoutes() {
  return (
    <>
      <Route path="/admin/tenants" element={withAdmin(<TenantList />)} />
      <Route path="/admin/tenants/create" element={withAdmin(<CreateTenant />)} />
      <Route path="/admin/tenants/:id" element={withAdmin(<TenantDetail />)} />
      <Route path="/admin/tenants/:id/edit" element={withAdmin(<EditTenant />)} />
      <Route path="/admin/tenants/:id/users" element={withAdmin(<TenantUsers />)} />
      <Route path="/admin/tenants/:id/rbac" element={withAdmin(<TenantRbac />)} />
      <Route path="/admin/tenant-rbac" element={withAdmin(<TenantRbac />)} />
    </>
  )
}
