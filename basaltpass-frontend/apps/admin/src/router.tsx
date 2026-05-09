import { Routes, Route, Navigate } from 'react-router-dom'
import { useMemo } from 'react'
import AdminRoute from '../../../src/features/admin/components/AdminRoute'
import { consumeSessionNotice, peekSessionNotice } from '../../../src/shared/utils/sessionNotice'
import { useI18n } from '../../../src/shared/i18n'

import AdminDashboard from '../../../src/features/admin/Dashboard'
import Users from '../../../src/features/admin/user/Users'
import UserDetail from '../../../src/features/admin/user/UserDetail'
import Roles from '../../../src/features/admin/user/Roles'
import WalletManagement from '../../../src/features/admin/wallet/WalletManagement'
import Logs from '../../../src/features/admin/Logs'

import OAuthClients from '../../../src/features/admin/oauth/OAuthClients'
import OAuthClientConfig from '../../../src/features/admin/oauth/OAuthClientConfig'

import AdminSubscriptions from '../../../src/features/admin/subscription/Subscriptions'
import AdminProducts from '../../../src/features/admin/subscription/Products'
import AdminPlans from '../../../src/features/admin/subscription/Plans'
import AdminPrices from '../../../src/features/admin/subscription/Prices'
import AdminCoupons from '../../../src/features/admin/subscription/Coupons'

import AdminPermissions from '../../../src/features/admin/rbac/Permissions'
import AdminSettingsPage from '../../../src/features/admin/settings/Index'
import SettingsCategoryPage from '../../../src/features/admin/settings/SettingsCategoryPage'

import TenantList from '../../../src/features/admin/tenant/TenantList'
import CreateTenant from '../../../src/features/admin/tenant/CreateTenant'
import TenantDetail from '../../../src/features/admin/tenant/TenantDetail'
import EditTenant from '../../../src/features/admin/tenant/EditTenant'
import TenantUsers from '../../../src/features/admin/tenant/TenantUsers'
import TenantRbac from '../../../src/features/admin/tenant/TenantRbac'

import AppList from '../../../src/features/admin/app/AppList'
import CreateApp from '../../../src/features/admin/app/CreateApp'

import AdminNotifications from '../../../src/features/admin/notification/Notifications'
import AdminTeamsPage from '../../../src/features/admin/team/Teams'
import AdminInvitationsPage from '../../../src/features/admin/invitation/Invitations'

import EmailTest from '../../../src/features/admin/email/EmailTest'

import NotFound from '../../../src/features/NotFound'

function Entry() {
  const { t } = useI18n()
  const noticeCode = useMemo(() => {
    const current = peekSessionNotice()
    if (!current) {
      return ''
    }
    return consumeSessionNotice() || ''
  }, [])
  const userUrl = (import.meta as any).env?.VITE_CONSOLE_USER_URL || ''
  const joinUrl = (base: string, path: string) => {
    const b = (base || '').replace(/\/+$/, '')
    const p = (path || '').replace(/^\//, '')
    if (!b) return '/' + p
    return `${b}/${p}`
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow p-6">
        <h1 className="text-lg font-semibold text-gray-900">{t('entry.adminConsole')}</h1>
        {noticeCode ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {noticeCode === 'session_expired' ? t('entry.adminSessionExpired') : t(`sessionNotice.${noticeCode}`)}
          </div>
        ) : null}
        <p className="mt-2 text-sm text-gray-600">
          {t('entry.adminEntryHelp')}
        </p>
        <a
          className="mt-4 inline-block text-indigo-600 hover:underline"
          href={joinUrl(userUrl, noticeCode ? 'login' : 'dashboard')}
        >
          {noticeCode ? t('common.relogin') : t('common.backToUserConsole')}
        </a>
      </div>
    </div>
  )
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<Entry />} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

      <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

      <Route path="/admin/users" element={<AdminRoute><Users /></AdminRoute>} />
      <Route path="/admin/users/:id" element={<AdminRoute><UserDetail /></AdminRoute>} />
      <Route path="/admin/roles" element={<AdminRoute><Roles /></AdminRoute>} />

      <Route path="/admin/wallets" element={<AdminRoute><WalletManagement /></AdminRoute>} />
      <Route path="/admin/wallet-management" element={<AdminRoute><WalletManagement /></AdminRoute>} />
      <Route path="/admin/logs" element={<AdminRoute><Logs /></AdminRoute>} />

      <Route path="/admin/oauth/clients" element={<AdminRoute><OAuthClients /></AdminRoute>} />
      <Route path="/admin/oauth/clients/:clientId" element={<AdminRoute><OAuthClientConfig /></AdminRoute>} />

      <Route path="/admin/subscriptions" element={<AdminRoute><AdminSubscriptions /></AdminRoute>} />
      <Route path="/admin/products" element={<AdminRoute><AdminProducts /></AdminRoute>} />
      <Route path="/admin/plans" element={<AdminRoute><AdminPlans /></AdminRoute>} />
      <Route path="/admin/prices" element={<AdminRoute><AdminPrices /></AdminRoute>} />
      <Route path="/admin/coupons" element={<AdminRoute><AdminCoupons /></AdminRoute>} />

      <Route path="/admin/permissions" element={<AdminRoute><AdminPermissions /></AdminRoute>} />
      <Route path="/admin/settings/:category" element={<AdminRoute><SettingsCategoryPage /></AdminRoute>} />
      <Route path="/admin/settings" element={<AdminRoute><AdminSettingsPage /></AdminRoute>} />

      <Route path="/admin/tenants" element={<AdminRoute><TenantList /></AdminRoute>} />
      <Route path="/admin/tenants/create" element={<AdminRoute><CreateTenant /></AdminRoute>} />
      <Route path="/admin/tenants/:id" element={<AdminRoute><TenantDetail /></AdminRoute>} />
      <Route path="/admin/tenants/:id/edit" element={<AdminRoute><EditTenant /></AdminRoute>} />
      <Route path="/admin/tenants/:id/users" element={<AdminRoute><TenantUsers /></AdminRoute>} />
      <Route path="/admin/tenants/:id/rbac" element={<AdminRoute><TenantRbac /></AdminRoute>} />
      <Route path="/admin/tenant-rbac" element={<AdminRoute><TenantRbac /></AdminRoute>} />

      <Route path="/admin/apps" element={<AdminRoute><AppList /></AdminRoute>} />
      <Route path="/admin/apps/create" element={<AdminRoute><CreateApp /></AdminRoute>} />

      <Route path="/admin/notifications" element={<AdminRoute><AdminNotifications /></AdminRoute>} />
      <Route path="/admin/teams" element={<AdminRoute><AdminTeamsPage /></AdminRoute>} />
      <Route path="/admin/invitations" element={<AdminRoute><AdminInvitationsPage /></AdminRoute>} />
      
      <Route path="/admin/email/test" element={<AdminRoute><EmailTest /></AdminRoute>} />

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
