import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  BuildingOfficeIcon,
  CubeIcon,
  UsersIcon,
  UserGroupIcon,
  Cog6ToothIcon,
  ChevronDownIcon,
  WalletIcon,
  CreditCardIcon,
  GiftIcon,
  CurrencyDollarIcon,
  TagIcon,
  DocumentTextIcon,
  BellIcon,
  KeyIcon,
  ShoppingCartIcon,
  EnvelopeIcon
} from '@heroicons/react/24/outline'
import { ROUTES } from '@constants'
import { useConfig } from '@contexts/ConfigContext'
import { useI18n } from '@shared/i18n'

interface NavigationItem {
  key: string
  href?: string
  icon: React.ComponentType<any>
  children?: NavigationItem[]
  current?: boolean
  requiresMarket?: boolean
}

const navigationItems: NavigationItem[] = [
  {
    key: 'adminNav.dashboard',
    href: ROUTES.admin.dashboard,
    icon: BuildingOfficeIcon,
  },
  {
    key: 'adminNav.notifications',
    href: ROUTES.admin.notifications,
    icon: BellIcon,
  },
  {
    key: 'adminNav.userManagement',
    icon: UsersIcon,
    children: [
      { key: 'adminNav.userList', href: ROUTES.admin.users, icon: UsersIcon },
    ]
  },
  {
    key: 'adminNav.collaboration',
    icon: UsersIcon,
    children: [
      { key: 'adminNav.teams', href: ROUTES.admin.teams, icon: UsersIcon },
      { key: 'adminNav.invitations', href: ROUTES.admin.invitations, icon: UserGroupIcon },
    ]
  },
  {
    key: 'adminNav.systemRolesPermissions',
    icon: KeyIcon,
    children: [
      { key: 'adminNav.roles', href: ROUTES.admin.roles, icon: KeyIcon },
      { key: 'adminNav.permissions', href: ROUTES.admin.permissions, icon: KeyIcon },
    ]
  },
  {
    key: 'adminNav.subscriptionPayment',
    icon: CreditCardIcon,
    requiresMarket: true,
    children: [
      { key: 'adminNav.subscriptions', href: ROUTES.admin.subscriptions, icon: CreditCardIcon },
      { key: 'adminNav.products', href: ROUTES.admin.products, icon: ShoppingCartIcon },
      { key: 'adminNav.plans', href: ROUTES.admin.plans, icon: GiftIcon },
      { key: 'adminNav.prices', href: ROUTES.admin.prices, icon: CurrencyDollarIcon },
      { key: 'adminNav.coupons', href: ROUTES.admin.coupons, icon: TagIcon },
    ]
  },
  {
    key: 'adminNav.walletManagement',
    icon: WalletIcon,
    requiresMarket: true,
    children: [
      { key: 'adminNav.walletOverview', href: ROUTES.admin.wallets, icon: WalletIcon },
    ]
  },
  {
    key: 'adminNav.tenantManagement',
    icon: BuildingOfficeIcon,
    children: [
      { key: 'adminNav.tenantList', href: ROUTES.admin.tenants, icon: BuildingOfficeIcon },
      { key: 'adminNav.createTenant', href: ROUTES.admin.tenantsCreate, icon: BuildingOfficeIcon },
      { key: 'adminNav.tenantRbac', href: ROUTES.admin.tenantRbac, icon: KeyIcon },
    ]
  },
  {
    key: 'adminNav.systemManagement',
    icon: Cog6ToothIcon,
    children: [
      { key: 'adminNav.generalSettings', href: ROUTES.admin.settings.general, icon: Cog6ToothIcon },
      { key: 'adminNav.authSettings', href: ROUTES.admin.settings.auth, icon: KeyIcon },
      { key: 'adminNav.securitySettings', href: ROUTES.admin.settings.security, icon: KeyIcon },
      { key: 'adminNav.corsSettings', href: ROUTES.admin.settings.cors, icon: Cog6ToothIcon },
      { key: 'adminNav.oauthSettings', href: ROUTES.admin.settings.oauth, icon: KeyIcon },
      { key: 'adminNav.emailSettings', href: ROUTES.admin.settings.email, icon: EnvelopeIcon },
      { key: 'adminNav.smtpSettings', href: ROUTES.admin.settings.smtp, icon: EnvelopeIcon },
      { key: 'adminNav.emailCenter', href: ROUTES.admin.settings.emailTest, icon: EnvelopeIcon },
      { key: 'adminNav.logSettings', href: ROUTES.admin.settings.logging, icon: DocumentTextIcon },
      { key: 'adminNav.auditLogs', href: ROUTES.admin.logs, icon: DocumentTextIcon },
      { key: 'adminNav.sessionSettings', href: ROUTES.admin.settings.session, icon: Cog6ToothIcon },
      { key: 'adminNav.branding', href: ROUTES.admin.settings.ui, icon: Cog6ToothIcon },
      { key: 'adminNav.uploadSettings', href: ROUTES.admin.settings.uploads, icon: Cog6ToothIcon },
      { key: 'adminNav.notificationSettings', href: ROUTES.admin.settings.notifications, icon: BellIcon },
      { key: 'adminNav.jwtSettings', href: ROUTES.admin.settings.jwt, icon: KeyIcon },
      { key: 'adminNav.cacheSettings', href: ROUTES.admin.settings.cache, icon: Cog6ToothIcon },
      { key: 'adminNav.storageSettings', href: ROUTES.admin.settings.storage, icon: Cog6ToothIcon },
      { key: 'adminNav.billingSubscription', href: ROUTES.admin.settings.billing, icon: CreditCardIcon },
      { key: 'adminNav.featureFlags', href: ROUTES.admin.settings.features, icon: Cog6ToothIcon },
      { key: 'adminNav.maintenanceMode', href: ROUTES.admin.settings.maintenance, icon: Cog6ToothIcon },
      { key: 'adminNav.analytics', href: ROUTES.admin.settings.analytics, icon: Cog6ToothIcon },
      { key: 'adminNav.captcha', href: ROUTES.admin.settings.captcha, icon: Cog6ToothIcon },
      { key: 'adminNav.webhooks', href: ROUTES.admin.settings.webhooks, icon: Cog6ToothIcon },
      { key: 'adminNav.auditSettings', href: ROUTES.admin.settings.audit, icon: DocumentTextIcon },
      { key: 'adminNav.paginationSettings', href: ROUTES.admin.settings.pagination, icon: Cog6ToothIcon },
    ]
  },
]

export default function AdminNavigation() {
  const { t } = useI18n()
  const location = useLocation()
  const { marketEnabled } = useConfig()

  const isCurrentPath = (href: string) => {
    return location.pathname === href || location.pathname.startsWith(href + '/')
  }

  const navigation = navigationItems.filter(item => {
    if (item.requiresMarket && !marketEnabled) {
      return false
    }
    return true
  })

  const activeSectionKey =
    navigation.find(item => item.children?.some(child => child.href && isCurrentPath(child.href)))?.key ?? null

  const [expandedSection, setExpandedSection] = useState<string | null>(
    activeSectionKey ?? 'adminNav.systemManagement'
  )

  useEffect(() => {
    if (activeSectionKey) {
      setExpandedSection(activeSectionKey)
    }
  }, [activeSectionKey])

  const toggleSection = (sectionKey: string) => {
    setExpandedSection(prev => (prev === sectionKey ? null : sectionKey))
  }

  const renderNavigationItem = (item: NavigationItem, depth = 0) => {
    const isExpanded = expandedSection === item.key
    const isCurrent = item.href ? isCurrentPath(item.href) : false
    const hasCurrentChild = item.children?.some(child => child.href && isCurrentPath(child.href))
    const sharedStateClass = hasCurrentChild || isCurrent
      ? 'bg-indigo-100 text-indigo-900 shadow-sm'
      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'

    if (item.children) {
      return (
        <div key={item.key}>
          <button
            onClick={() => toggleSection(item.key)}
            className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm font-medium rounded-lg transition-colors ${sharedStateClass}`}
            style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
            aria-expanded={isExpanded}
          >
            <div className="flex items-center">
              <item.icon className="h-5 w-5 mr-3" />
              {t(item.key)}
            </div>
            <ChevronDownIcon
              className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? 'rotate-180' : '-rotate-90'}`}
            />
          </button>
          <div
            className={`mt-1 space-y-1 overflow-hidden transition-all duration-300 ease-out ${
              isExpanded ? 'max-h-[1200px] opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-1 pointer-events-none'
            }`}
          >
            {item.children.map(child => renderNavigationItem(child, depth + 1))}
          </div>
        </div>
      )
    }

    return (
      <Link
        key={item.key}
        to={item.href!}
        className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
          isCurrent
            ? 'bg-indigo-100 text-indigo-900 shadow-sm'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
        }`}
        style={{ paddingLeft: `${0.75 + depth * 1}rem` }}
      >
        <item.icon className="h-5 w-5 mr-3" />
        {t(item.key)}
      </Link>
    )
  }

  return (
    <nav className="space-y-1">
      {navigation.map(item => renderNavigationItem(item))}
    </nav>
  )
}
