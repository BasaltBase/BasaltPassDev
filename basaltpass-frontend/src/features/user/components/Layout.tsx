import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  Bars3Icon, 
  XMarkIcon,
  HomeIcon,
  UserIcon,
  CogIcon,
  QuestionMarkCircleIcon,
  BellIcon,
  UserGroupIcon,
  WalletIcon,
  ShieldCheckIcon,
  ArrowsRightLeftIcon,
  CreditCardIcon,
  CubeIcon,
  Squares2X2Icon,
  InformationCircleIcon,
  ChevronDownIcon,
  ArrowRightOnRectangleIcon,
  MoonIcon,
  SunIcon,
  ComputerDesktopIcon
} from '@heroicons/react/24/outline'
import { Modal, PButton } from '@ui'
import { useAuth } from '@contexts/AuthContext'
import { useConfig } from '@contexts/ConfigContext'
import EnhancedNotificationIcon from '@components/EnhancedNotificationIcon'
import { authorizeConsole } from '@api/console'
import { uiAlert } from '@contexts/DialogContext'
import { ROUTES } from '@constants'
import ConsoleAccountSwitcherModal from '@components/ConsoleAccountSwitcherModal'
import { useI18n } from '@shared/i18n'

interface LayoutProps {
  children: React.ReactNode
}

type UserThemePreference = 'light' | 'dark' | 'system'

const USER_THEME_LEGACY_STORAGE_KEY = 'basaltpass:user-theme'
const USER_THEME_STORAGE_KEY = 'basaltpass:user-theme-preference'

const getBrowserTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [openThemeMenu, setOpenThemeMenu] = useState<string | null>(null)
  const [themePreference, setThemePreference] = useState<UserThemePreference>(() => {
    if (typeof window === 'undefined') return 'light'
    const storedTheme = window.localStorage.getItem(USER_THEME_STORAGE_KEY)
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') return storedTheme
    return 'system'
  })
  const [browserTheme, setBrowserTheme] = useState<'light' | 'dark'>(getBrowserTheme)
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false)
  const [showTenantPerspectivePicker, setShowTenantPerspectivePicker] = useState(false)
  const [switchingTenantId, setSwitchingTenantId] = useState<number | null>(null)
  const desktopUserMenuRef = useRef<HTMLDivElement | null>(null)
  const mobileUserMenuRef = useRef<HTMLDivElement | null>(null)
  const location = useLocation()
  const { t } = useI18n()
  const { user, tenants, logout, switchAccount, switchTenantIdentity, canAccessTenant, canAccessAdmin, canUseWallet } = useAuth()
  const { marketEnabled, siteName, setPageTitle } = useConfig()
  const theme = themePreference === 'system' ? browserTheme : themePreference
  const isDarkTheme = theme === 'dark'
  const themeMenuLabel = t('userLayout.theme.openMenu')
  const currentSessionKey = `${user?.id || 0}:${Number(user?.tenant_id || 0)}`

  const tenantDisplayName = (() => {
    if (user?.tenant_id && user.tenant_id > 0) {
      const currentTenant = tenants.find((t) => Number(t.id) === user.tenant_id)
      if (currentTenant?.name) return currentTenant.name
    }
    if (tenants.length === 1 && tenants[0]?.name) return tenants[0].name
    return siteName
  })()

  const manageableTenants = tenants.filter((tenant) => {
    const roleFromMetadata = String((tenant as any)?.metadata?.user_role || '').toLowerCase()
    const role = roleFromMetadata || String(tenant?.role || '').toLowerCase()
    return Number(tenant?.id || 0) > 0 && ['owner', 'admin'].includes(role)
  })

  const navigation = [
    { name: t('userLayout.nav.dashboard'), href: ROUTES.user.dashboard, icon: HomeIcon },
    { name: t('userLayout.nav.profile'), href: ROUTES.user.profile, icon: UserIcon },
    { name: t('userLayout.nav.teams'), href: ROUTES.user.teams, icon: UserGroupIcon },
    { name: t('userLayout.nav.wallet'), href: ROUTES.user.wallet, icon: WalletIcon, requiresMarket: true },
    { name: t('userLayout.nav.subscriptions'), href: ROUTES.user.subscriptions, icon: CreditCardIcon, requiresMarket: true },
    { name: t('userLayout.nav.products'), href: ROUTES.user.products, icon: CubeIcon, requiresMarket: true },
    { name: t('userLayout.nav.orders'), href: ROUTES.user.orders, icon: ArrowsRightLeftIcon, requiresMarket: true },
    { name: t('userLayout.nav.myApps'), href: ROUTES.user.myApps, icon: Squares2X2Icon },
    { name: t('userLayout.nav.security'), href: ROUTES.user.security, icon: ShieldCheckIcon },
    { name: t('userLayout.nav.settings'), href: ROUTES.user.settings, icon: CogIcon },
    { name: t('userLayout.nav.help'), href: ROUTES.user.help, icon: QuestionMarkCircleIcon },
  ]

  useEffect(() => {
    setPageTitle(t('userLayout.pageTitle'))
  }, [setPageTitle, t])

  useEffect(() => {
    if (!window.localStorage.getItem(USER_THEME_STORAGE_KEY)) {
      window.localStorage.removeItem(USER_THEME_LEGACY_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    if (!openThemeMenu) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Element | null
      if (target?.closest('[data-theme-menu-root]')) return
      setOpenThemeMenu(null)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [openThemeMenu])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkTheme)
    document.documentElement.style.colorScheme = isDarkTheme ? 'dark' : 'light'
  }, [isDarkTheme])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemThemeChange = () => setBrowserTheme(mediaQuery.matches ? 'dark' : 'light')

    handleSystemThemeChange()
    mediaQuery.addEventListener('change', handleSystemThemeChange)
    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [])

  useEffect(() => {
    setSidebarOpen(false)
    setIsUserMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isUserMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return

      const clickedDesktopMenu = desktopUserMenuRef.current?.contains(target)
      const clickedMobileMenu = mobileUserMenuRef.current?.contains(target)

      if (clickedDesktopMenu || clickedMobileMenu) return
      setIsUserMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [isUserMenuOpen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setIsUserMenuOpen(false)
      setSidebarOpen(false)
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleLogout = () => {
    logout()
  }

  const selectThemePreference = (nextThemePreference: UserThemePreference) => {
    setThemePreference(nextThemePreference)
    window.localStorage.setItem(USER_THEME_STORAGE_KEY, nextThemePreference)
    window.localStorage.removeItem(USER_THEME_LEGACY_STORAGE_KEY)
    setOpenThemeMenu(null)
  }

  const themeOptions: Array<{
    value: UserThemePreference
    label: string
    icon: typeof ComputerDesktopIcon
  }> = [
    { value: 'system', label: t('userLayout.theme.system'), icon: ComputerDesktopIcon },
    { value: 'light', label: t('userLayout.theme.light'), icon: SunIcon },
    { value: 'dark', label: t('userLayout.theme.dark'), icon: MoonIcon },
  ]

  const CurrentThemeIcon =
    themePreference === 'system'
      ? ComputerDesktopIcon
      : themePreference === 'dark'
        ? MoonIcon
        : SunIcon

  const renderThemeControl = (menuId: string, menuDirection: 'up' | 'down' = 'up') => (
    <div className="relative" data-theme-menu-root>
      <PButton
        variant="ghost"
        size="sm"
        onClick={() => setOpenThemeMenu((currentMenu) => currentMenu === menuId ? null : menuId)}
        className="h-11 w-11 rounded-lg p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
        title={themeMenuLabel}
        aria-label={themeMenuLabel}
        aria-haspopup="menu"
        aria-expanded={openThemeMenu === menuId}
      >
        <CurrentThemeIcon className="h-8 w-8 stroke-[2.4]" />
      </PButton>

      {openThemeMenu === menuId && (
        <div className={`absolute right-0 z-50 w-40 overflow-hidden rounded-xl bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 dark:bg-gray-900 dark:ring-white/10 ${
          menuDirection === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'
        }`}>
          {themeOptions.map((option) => {
            const OptionIcon = option.icon
            const isSelected = themePreference === option.value

            return (
              <button
                key={option.value}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-200'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
                onClick={() => selectThemePreference(option.value)}
              >
                <OptionIcon className="h-5 w-5 stroke-[2.4]" />
                <span>{option.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )

  const getUserInitial = () => {
    if (user?.nickname) return user.nickname.charAt(0).toUpperCase()
    if (user?.email) return user.email.charAt(0).toUpperCase()
    return 'U'
  }

  const userDisplayName = user?.nickname || user?.email || t('common.user')

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(`${href}/`)

  // 
  const filteredNavigation = navigation.filter(item => {
    if (item.href === ROUTES.user.wallet && !canUseWallet) {
      return false
    }
    if (item.requiresMarket && !marketEnabled) {
      return false
    }
    return true
  })

  const consoleUserUrl = (import.meta as any).env?.VITE_CONSOLE_USER_URL || ''
  const consoleTenantUrl = (import.meta as any).env?.VITE_CONSOLE_TENANT_URL || ''
  const consoleAdminUrl = (import.meta as any).env?.VITE_CONSOLE_ADMIN_URL || ''

  const joinUrl = (base: string, path: string) => {
    const b = (base || '').replace(/\/+$/, '')
    const p = (path || '').replace(/^\//, '')
    if (!b) return '/' + p
    return `${b}/${p}`
  }

  const switchToTenantById = async (tenantId: number) => {
    setSwitchingTenantId(tenantId)
    try {
      const { code } = await authorizeConsole('tenant', tenantId)
      const url = joinUrl(consoleTenantUrl, `tenant/dashboard?code=${encodeURIComponent(code)}`)
      window.location.href = url
    } catch (error: any) {
      const message = error?.response?.data?.error || t('userLayout.tenantSwitchFailed')
      await uiAlert(message, t('userLayout.tenantSwitchFailedTitle'))
      setSwitchingTenantId(null)
    }
  }

  const switchToTenant = async () => {
    if (manageableTenants.length === 0) {
      await uiAlert(t('userLayout.noTenantPerspectiveAvailable'), t('userLayout.tenantSwitchFailedTitle'))
      return
    }

    if (manageableTenants.length === 1) {
      await switchToTenantById(Number(manageableTenants[0].id || 0))
      return
    }

    setShowTenantPerspectivePicker(true)
  }

  const switchToAdmin = async () => {
    const { code } = await authorizeConsole('admin')
    const url = joinUrl(consoleAdminUrl, `admin/dashboard?code=${encodeURIComponent(code)}`)
    window.location.href = url
  }

  return (
    <div className="user-console-shell h-screen flex overflow-hidden bg-gray-100 dark:bg-gray-950">
      {/*  */}
      {sidebarOpen && (
        <div className="fixed inset-0 !m-0 flex z-40 md:hidden">
          <div className="fixed inset-0 !m-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white">
            <div className="absolute right-3 top-3">
              <PButton
                variant="ghost"
                size="sm"
                className="flex items-center justify-center h-10 w-10 rounded-full text-gray-700 hover:text-gray-900 hover:bg-gray-100"
                onClick={() => setSidebarOpen(false)}
                aria-label={t('common.closeSidebar')}
              >
                <XMarkIcon className="h-6 w-6" />
              </PButton>
            </div>
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center px-4">
                <h1 className="text-2xl font-bold text-gray-900">{tenantDisplayName}</h1>
              </div>
              <nav className="mt-5 px-2 space-y-1">
                {filteredNavigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`${
                      isActive(item.href)
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    } group flex items-center px-2 py-2 text-base font-medium rounded-lg`}
                  >
                    <item.icon className="text-gray-400 mr-4 h-6 w-6" />
                    {item.name}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex flex-shrink-0 border-t border-gray-200 p-2">
              <div className="flex w-full items-center justify-between">
                <div ref={mobileUserMenuRef} className="relative">
                  <PButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center justify-start rounded-lg bg-white px-1 py-1 text-sm hover:bg-gray-50"
                    aria-label={t('common.openUserMenu')}
                  >
                    {user?.avatar_url ? (
                      <img
                        className="h-7 w-7 rounded-full object-cover"
                        src={user.avatar_url}
                        alt={user?.nickname || user?.email || 'User'}
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center">
                        <span className="text-xs font-medium text-white">{getUserInitial()}</span>
                      </div>
                    )}
                    <span className="ml-2 max-w-[8rem] truncate text-sm font-medium text-gray-700">{userDisplayName}</span>
                    <ChevronDownIcon className="ml-1 h-4 w-4 text-gray-500" />
                  </PButton>

                  {isUserMenuOpen && (
                    <div className="absolute left-0 z-50 bottom-full mb-2 w-56 origin-bottom-left overflow-hidden rounded-xl bg-white pt-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <div className="px-4 py-3 border-b border-gray-200">
                        <p className="text-sm text-gray-900 font-medium">{user?.nickname || t('common.user')}</p>
                        <p className="text-sm text-gray-500 truncate">{user?.email}</p>
                      </div>
                      <Link
                        to={ROUTES.user.profile}
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <UserIcon className="mr-3 h-4 w-4" />
                        {t('common.profile')}
                      </Link>
                      <Link
                        to={ROUTES.user.settings}
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <CogIcon className="mr-3 h-4 w-4" />
                        {t('common.settings')}
                      </Link>

                      {canAccessTenant && (
                        <PButton
                          variant="ghost"
                          onClick={() => {
                            setIsUserMenuOpen(false)
                            void switchToTenant()
                          }}
                          className="flex w-full items-center justify-start rounded-none px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                        >
                          <ArrowsRightLeftIcon className="mr-3 h-4 w-4" />
                          {t('userLayout.tenantManagement')}
                        </PButton>
                      )}

                      {canAccessAdmin && (
                        <PButton
                          variant="ghost"
                          onClick={() => {
                            setIsUserMenuOpen(false)
                            void switchToAdmin()
                          }}
                          className="flex w-full items-center justify-start rounded-none px-4 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          <ArrowsRightLeftIcon className="mr-3 h-4 w-4" />
                          {t('userLayout.adminPanel')}
                        </PButton>
                      )}

                      <PButton
                        variant="ghost"
                        onClick={() => {
                          setShowAccountSwitcher(true)
                          setIsUserMenuOpen(false)
                        }}
                        className="flex w-full items-center justify-start rounded-none px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                      >
                        <ArrowsRightLeftIcon className="mr-3 h-4 w-4" />
                        {t('common.switchAccount')}
                      </PButton>
                      <div className="border-t border-gray-200"></div>
                      <PButton
                        variant="ghost"
                        onClick={handleLogout}
                        className="flex w-full items-center justify-start rounded-t-none rounded-b-xl px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
                      >
                        <ArrowRightOnRectangleIcon className="mr-3 h-4 w-4" />
                        {t('common.logout')}
                      </PButton>
                    </div>
                  )}
                </div>

                <div className="relative ml-3 flex flex-shrink-0 items-center gap-2">
                  {renderThemeControl('mobile-sidebar')}
                  <EnhancedNotificationIcon
                    viewAllPath={ROUTES.user.notifications}
                    dropdownDirection="up"
                    dropdownAlign="left"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/*  */}
      <div className="hidden md:flex md:flex-shrink-0">
        <div className="flex flex-col w-64">
          <div className="flex flex-col h-0 flex-1 border-r border-gray-200 bg-white">
            <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
              <div className="flex items-center flex-shrink-0 px-4">
                <h1 className="text-2xl font-bold text-gray-900">{tenantDisplayName}</h1>
              </div>
              <nav className="mt-5 flex-1 px-2 bg-white space-y-1">
                {filteredNavigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`${
                      isActive(item.href)
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    } group flex items-center px-2 py-2 text-sm font-medium rounded-lg`}
                  >
                    <item.icon className="text-gray-400 mr-3 h-6 w-6" />
                    {item.name}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex flex-shrink-0 border-t border-gray-200 p-2">
              <div className="flex w-full items-center justify-between">
                <div ref={desktopUserMenuRef} className="relative">
                  <PButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center justify-start rounded-lg bg-white px-1 py-1 text-sm focus:ring-blue-500 focus:ring-offset-2 hover:bg-gray-50"
                    title={t('common.openUserMenu')}
                  >
                    <span className="sr-only">{t('common.openUserMenu')}</span>
                    {user?.avatar_url ? (
                      <img
                        className="h-7 w-7 rounded-full object-cover"
                        src={user.avatar_url}
                        alt={user?.nickname || user?.email || 'User'}
                      />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center">
                        <span className="text-xs font-medium text-white">{getUserInitial()}</span>
                      </div>
                    )}
                    <span className="ml-2 max-w-[8rem] truncate text-sm font-medium text-gray-700">{userDisplayName}</span>
                    <ChevronDownIcon className="ml-1 h-4 w-4 text-gray-500" />
                  </PButton>

                  {isUserMenuOpen && (
                    <div className="absolute left-0 z-50 bottom-full mb-2 w-56 origin-bottom-left overflow-hidden rounded-xl bg-white pt-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                      <div className="px-4 py-3 border-b border-gray-200">
                        <p className="text-sm text-gray-900 font-medium">{user?.nickname || t('common.user')}</p>
                        <p className="text-sm text-gray-500 truncate">{user?.email}</p>
                      </div>
                      <Link
                        to={ROUTES.user.profile}
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <UserIcon className="mr-3 h-4 w-4" />
                        {t('common.profile')}
                      </Link>
                      <Link
                        to={ROUTES.user.settings}
                        className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        <CogIcon className="mr-3 h-4 w-4" />
                        {t('common.settings')}
                      </Link>

                      {canAccessTenant && (
                        <PButton
                          variant="ghost"
                          onClick={() => {
                            setIsUserMenuOpen(false)
                            void switchToTenant()
                          }}
                          className="flex w-full items-center justify-start rounded-none px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                        >
                          <ArrowsRightLeftIcon className="mr-3 h-4 w-4" />
                          {t('userLayout.tenantManagement')}
                        </PButton>
                      )}

                      {canAccessAdmin && (
                        <PButton
                          variant="ghost"
                          onClick={() => {
                            setIsUserMenuOpen(false)
                            void switchToAdmin()
                          }}
                          className="flex w-full items-center justify-start rounded-none px-4 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                        >
                          <ArrowsRightLeftIcon className="mr-3 h-4 w-4" />
                          {t('userLayout.adminPanel')}
                        </PButton>
                      )}

                      <PButton
                        variant="ghost"
                        onClick={() => {
                          setShowAccountSwitcher(true)
                          setIsUserMenuOpen(false)
                        }}
                        className="flex w-full items-center justify-start rounded-none px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                      >
                        <ArrowsRightLeftIcon className="mr-3 h-4 w-4" />
                        {t('common.switchAccount')}
                      </PButton>
                      <div className="border-t border-gray-200"></div>
                      <PButton
                        variant="ghost"
                        onClick={handleLogout}
                        className="flex w-full items-center justify-start rounded-t-none rounded-b-xl px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
                      >
                        <ArrowRightOnRectangleIcon className="mr-3 h-4 w-4" />
                        {t('common.logout')}
                      </PButton>
                    </div>
                  )}
                </div>

                <div className="relative ml-3 flex flex-shrink-0 items-center gap-2">
                  {renderThemeControl('desktop')}
                  <EnhancedNotificationIcon
                    viewAllPath={ROUTES.user.notifications}
                    dropdownDirection="up"
                    dropdownAlign="left"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/*  */}
      <div className="flex flex-col w-0 flex-1 overflow-hidden">
        {/*  */}
        <div className="md:hidden border-b border-gray-200 bg-white px-3 py-2">
          <div className="flex items-center justify-start">
            <PButton
              variant="ghost"
              size="md"
              className="h-11 w-11 inline-flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 focus:ring-inset focus:ring-indigo-500"
              onClick={() => setSidebarOpen(true)}
              aria-label={t('common.openSidebar')}
            >
              <Bars3Icon className="h-6 w-6" />
            </PButton>
            <div className="ml-2">
              {renderThemeControl('mobile-top', 'down')}
            </div>
          </div>
        </div>
        
        {/*  */}
        <main className="flex-1 relative overflow-y-auto focus:outline-none">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>

      <ConsoleAccountSwitcherModal
        open={showAccountSwitcher}
        onClose={() => setShowAccountSwitcher(false)}
        currentScope="user"
        currentTenantId={Number(user?.tenant_id || 0)}
        currentUserId={Number(user?.id || 0)}
        currentSessionKey={currentSessionKey}
        currentUserTenants={tenants.map((tenant) => ({
          id: Number(tenant?.id || 0),
          name: tenant?.name,
          code: tenant?.code,
          role: tenant?.role,
          metadata: tenant?.metadata,
        }))}
        consoleUserUrl={consoleUserUrl}
        consoleTenantUrl={consoleTenantUrl}
        consoleAdminUrl={consoleAdminUrl}
        onSwitchSession={switchAccount}
        onSwitchTenantIdentity={switchTenantIdentity}
      />

      <Modal
        open={showTenantPerspectivePicker}
        onClose={() => {
          if (!switchingTenantId) {
            setShowTenantPerspectivePicker(false)
          }
        }}
        title={t('userLayout.selectTenantPerspectiveTitle')}
        description={t('userLayout.selectTenantPerspectiveDescription')}
        widthClass="max-w-xl"
      >
        <div className="space-y-3">
          {manageableTenants.map((tenant) => {
            const roleFromMetadata = String((tenant as any)?.metadata?.user_role || '').toLowerCase()
            const role = roleFromMetadata || String(tenant?.role || '').toLowerCase()
            const tenantName = tenant?.name || t('userLayout.tenantUnknown')
            const tenantId = Number(tenant?.id || 0)

            return (
              <div key={tenantId} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{tenantName}</div>
                  <div className="mt-1 text-xs text-gray-500">ID: {tenantId} {role ? `· ${role}` : ''}</div>
                </div>
                <PButton
                  type="button"
                  size="sm"
                  loading={switchingTenantId === tenantId}
                  disabled={!!switchingTenantId}
                  onClick={() => void switchToTenantById(tenantId)}
                >
                  {t('userLayout.switchToTenantFor', { tenant: tenantName })}
                </PButton>
              </div>
            )
          })}
        </div>
      </Modal>

  {/* ， */}
    </div>
  )
} 
