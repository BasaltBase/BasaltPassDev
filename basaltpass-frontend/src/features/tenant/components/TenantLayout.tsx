import { ReactNode, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bars3Icon, ChevronDownIcon, ArrowsRightLeftIcon, ComputerDesktopIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline'
import { UserIcon, Cog6ToothIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline'
import TenantNavigation from './TenantNavigation'
import { useAuth } from '@contexts/AuthContext'
import { useConfig } from '@contexts/ConfigContext'
import EnhancedNotificationIcon from '@components/EnhancedNotificationIcon'
import ConsoleAccountSwitcherModal from '@components/ConsoleAccountSwitcherModal'
import { PButton } from '@ui'
import { authorizeConsole, joinConsoleUrl } from '@api/console'
import { ROUTES } from '@constants'
import { useI18n } from '@shared/i18n'

interface TenantLayoutProps {
  children: ReactNode
  title?: string
  actions?: ReactNode
}

type TenantThemePreference = 'light' | 'dark' | 'system'

const THEME_LEGACY_STORAGE_KEY = 'basaltpass:user-theme'
const THEME_STORAGE_KEY = 'basaltpass:user-theme-preference'

const getBrowserTheme = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export default function TenantLayout({ children, title, actions }: TenantLayoutProps) {
  const { t } = useI18n()
  const { user, logout, canAccessAdmin } = useAuth()
  const { siteName, setPageTitle } = useConfig()
  const location = useLocation()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [openThemeMenu, setOpenThemeMenu] = useState<string | null>(null)
  const [themePreference, setThemePreference] = useState<TenantThemePreference>(() => {
    if (typeof window === 'undefined') return 'light'
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') return storedTheme
    return 'system'
  })
  const [browserTheme, setBrowserTheme] = useState<'light' | 'dark'>(getBrowserTheme)
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false)
  const mobileUserMenuRef = useRef<HTMLDivElement | null>(null)
  const desktopUserMenuRef = useRef<HTMLDivElement | null>(null)
  const theme = themePreference === 'system' ? browserTheme : themePreference
  const isDarkTheme = theme === 'dark'
  const themeMenuLabel = t('userLayout.theme.openMenu')
  const currentSessionKey = `${user?.id || 0}:${Number(user?.tenant_id || 0)}`

  const handleLogout = () => {
    logout()
  }

  const selectThemePreference = (nextThemePreference: TenantThemePreference) => {
    setThemePreference(nextThemePreference)
    window.localStorage.setItem(THEME_STORAGE_KEY, nextThemePreference)
    window.localStorage.removeItem(THEME_LEGACY_STORAGE_KEY)
    setOpenThemeMenu(null)
  }

  const themeOptions: Array<{
    value: TenantThemePreference
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

  // tenant
  const isTenantPath = location.pathname.startsWith(ROUTES.tenant.root)

  useEffect(() => {
    setPageTitle(title ? t('tenantLayout.pageTitle', { title }) : t('tenantLayout.pageTitleDefault'))
  }, [setPageTitle, t, title])

  useEffect(() => {
    if (!window.localStorage.getItem(THEME_STORAGE_KEY)) {
      window.localStorage.removeItem(THEME_LEGACY_STORAGE_KEY)
    }
  }, [])

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
    setIsUserMenuOpen(false)
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!isUserMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (!target) return
      const clickedMobileMenu = mobileUserMenuRef.current?.contains(target)
      const clickedDesktopMenu = desktopUserMenuRef.current?.contains(target)
      if (clickedMobileMenu || clickedDesktopMenu) return
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

  const consoleUserUrl = (import.meta as any).env?.VITE_CONSOLE_USER_URL || ''
  const consoleTenantUrl = (import.meta as any).env?.VITE_CONSOLE_TENANT_URL || ''
  const consoleAdminUrl = (import.meta as any).env?.VITE_CONSOLE_ADMIN_URL || ''

  const switchToAdmin = async () => {
    const { code } = await authorizeConsole('admin')
    window.location.href = joinConsoleUrl(consoleAdminUrl, `admin/dashboard?code=${encodeURIComponent(code)}`)
  }

  const switchToUser = () => {
    window.location.href = joinConsoleUrl(consoleUserUrl, 'dashboard')
  }

  const getUserInitial = () => {
    if (user?.nickname) {
      return user.nickname.charAt(0).toUpperCase()
    }
    if (user?.email) {
      return user.email.charAt(0).toUpperCase()
    }
    return 'U'
  }

  const userDisplayName = user?.nickname || user?.email || t('common.tenantUser')

  return (
    <div className="tenant-console-shell min-h-screen bg-gray-50 dark:bg-gray-950">
      <button
        onClick={() => setSidebarOpen(true)}
        className="fixed left-3 top-3 z-30 inline-flex items-center justify-center rounded-lg bg-white p-2 text-gray-500 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500 lg:hidden"
      >
        <span className="sr-only">{t('common.openSidebar')}</span>
        <Bars3Icon className="h-6 w-6" />
      </button>
      <div className="fixed right-3 top-3 z-30 lg:hidden">
        {renderThemeControl('mobile-top', 'down')}
      </div>

      <div className="flex">
        {/*  */}
        {sidebarOpen && (
          <div className="fixed inset-0 !m-0 z-40 flex lg:hidden">
            <div className="fixed inset-0 !m-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
            <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white">
              <div className="absolute top-0 right-0 -mr-12 pt-2">
                <button 
                  onClick={() => setSidebarOpen(false)}
                  className="ml-1 flex h-10 w-10 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
                >
                  <span className="sr-only">{t('common.closeSidebar')}</span>
                  <svg className="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="h-0 min-h-0 flex-1 overflow-y-auto pt-5 pb-4">
                <div className="flex flex-shrink-0 items-center px-4">
                  <h1 className="text-2xl font-bold text-gray-900">{siteName}</h1>
                </div>
                <nav className="mt-5 space-y-1 px-2">
                  <TenantNavigation />
                </nav>
              </div>
            <div className="flex flex-shrink-0 border-t border-gray-200 p-2">
              <div className="flex w-full items-center justify-between">
              {/*  */}
              <div ref={mobileUserMenuRef} className="relative">
                <PButton
                  variant="ghost" 
                  size="sm"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center justify-start rounded-lg bg-white px-1 py-1 text-sm focus:ring-blue-500 focus:ring-offset-2 hover:bg-gray-50"
                >
                  <span className="sr-only">{t('common.openUserMenu')}</span>
                  {user?.avatar_url ? (
                    <img 
                      className="h-7 w-7 rounded-full object-cover" 
                      src={user.avatar_url} 
                      alt={user.nickname || user.email}
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="text-xs font-medium text-white">{getUserInitial()}</span>
                    </div>
                  )}
                  <span className="ml-2 max-w-[8rem] truncate text-sm font-medium text-gray-700">{userDisplayName}</span>
                  <ChevronDownIcon className="ml-1 h-4 w-4 text-gray-500" />
                </PButton>

                {/*  */}
                {isUserMenuOpen && (
                  <div className="absolute left-0 z-50 bottom-full mb-2 w-56 origin-bottom-left overflow-hidden rounded-xl bg-white pt-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <p className="text-sm text-gray-900 font-medium">
                        {user?.nickname || t('common.tenantUser')}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {user?.email}
                      </p>
                    </div>
                    
                    <a
                      href={joinConsoleUrl(consoleUserUrl, 'profile')}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <UserIcon className="mr-3 h-4 w-4" />
                      {t('common.profile')}
                    </a>
                    
                    <a
                      href={joinConsoleUrl(consoleUserUrl, 'settings')}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <Cog6ToothIcon className="mr-3 h-4 w-4" />
                      {t('tenantLayout.tenantSettings')}
                    </a>

                    {isTenantPath && canAccessAdmin && (
                      <PButton
                        variant="ghost"
                        onClick={() => {
                          setIsUserMenuOpen(false)
                          void switchToAdmin()
                        }}
                        className="flex w-full items-center justify-start rounded-none px-4 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <ArrowsRightLeftIcon className="mr-3 h-4 w-4" />
                        {t('tenantLayout.switchToAdminLabel')}
                      </PButton>
                    )}

                    {isTenantPath && (
                      <PButton
                        variant="ghost"
                        onClick={() => {
                          setIsUserMenuOpen(false)
                          switchToUser()
                        }}
                        className="flex w-full items-center justify-start rounded-none px-4 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 hover:text-green-700"
                      >
                        <ArrowsRightLeftIcon className="mr-3 h-4 w-4" />
                        {t('tenantLayout.switchToUserLabel')}
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

              {/* ： NotificationProvider ， */}
              <div className="relative ml-3 flex flex-shrink-0 items-center gap-2">
                {renderThemeControl('mobile-sidebar')}
                <span className="sr-only">{t('common.viewNotifications')}</span>
                <EnhancedNotificationIcon
                  viewAllPath={ROUTES.tenant.notifications}
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
        <div className="hidden lg:flex lg:w-64 lg:min-h-0 lg:flex-col lg:fixed lg:inset-y-0">
          <div className="flex flex-1 min-h-0 flex-col bg-white border-r border-gray-200">
            <div className="flex flex-1 min-h-0 flex-col overflow-y-auto pt-5 pb-4">
              <div className="flex items-center flex-shrink-0 px-4">
                <h1 className="text-2xl font-bold text-gray-900">{siteName}</h1>
              </div>
              <div className="mt-5 flex flex-1 flex-col px-3">
                <TenantNavigation />
              </div>
            </div>
            <div className="flex flex-shrink-0 border-t border-gray-200 p-2">
              <div className="flex w-full items-center justify-between">
              {/*  */}
              <div ref={desktopUserMenuRef} className="relative">
                <PButton
                  variant="ghost" 
                  size="sm"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center justify-start rounded-lg bg-white px-1 py-1 text-sm focus:ring-blue-500 focus:ring-offset-2 hover:bg-gray-50"
                >
                  <span className="sr-only">{t('common.openUserMenu')}</span>
                  {user?.avatar_url ? (
                    <img 
                      className="h-7 w-7 rounded-full object-cover" 
                      src={user.avatar_url} 
                      alt={user.nickname || user.email}
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="text-xs font-medium text-white">{getUserInitial()}</span>
                    </div>
                  )}
                  <span className="ml-2 max-w-[8rem] truncate text-sm font-medium text-gray-700">{userDisplayName}</span>
                  <ChevronDownIcon className="ml-1 h-4 w-4 text-gray-500" />
                </PButton>

                {/*  */}
                {isUserMenuOpen && (
                  <div className="absolute left-0 z-50 bottom-full mb-2 w-56 origin-bottom-left overflow-hidden rounded-xl bg-white pt-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="px-4 py-3 border-b border-gray-200">
                      <p className="text-sm text-gray-900 font-medium">
                        {user?.nickname || t('common.tenantUser')}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {user?.email}
                      </p>
                    </div>
                    
                    <a
                      href={joinConsoleUrl(consoleUserUrl, 'profile')}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <UserIcon className="mr-3 h-4 w-4" />
                      {t('common.profile')}
                    </a>
                    
                    <a
                      href={joinConsoleUrl(consoleUserUrl, 'settings')}
                      className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      <Cog6ToothIcon className="mr-3 h-4 w-4" />
                      {t('tenantLayout.tenantSettings')}
                    </a>

                    {isTenantPath && canAccessAdmin && (
                      <PButton
                        variant="ghost"
                        onClick={() => {
                          setIsUserMenuOpen(false)
                          void switchToAdmin()
                        }}
                        className="flex w-full items-center justify-start rounded-none px-4 py-2 text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <ArrowsRightLeftIcon className="mr-3 h-4 w-4" />
                        {t('tenantLayout.switchToAdminLabel')}
                      </PButton>
                    )}

                    {isTenantPath && (
                      <PButton
                        variant="ghost"
                        onClick={() => {
                          setIsUserMenuOpen(false)
                          switchToUser()
                        }}
                        className="flex w-full items-center justify-start rounded-none px-4 py-2 text-sm font-medium text-green-600 transition-colors hover:bg-green-50 hover:text-green-700"
                      >
                        <ArrowsRightLeftIcon className="mr-3 h-4 w-4" />
                        {t('tenantLayout.switchToUserLabel')}
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

              {/* ： NotificationProvider ， */}
              <div className="relative ml-3 flex flex-shrink-0 items-center gap-2">
                {renderThemeControl('desktop')}
                <span className="sr-only">{t('common.viewNotifications')}</span>
                <EnhancedNotificationIcon
                  viewAllPath={ROUTES.tenant.notifications}
                  dropdownDirection="up"
                  dropdownAlign="left"
                />
              </div>

              </div>
            </div>

          </div>
        </div>

        {/*  */}
        <div className="lg:ml-64 flex-1 min-w-0 w-full lg:max-w-[calc(100vw-16rem)] max-w-[100vw]">
          <main className="py-6">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
        </div>
      </div>

      <ConsoleAccountSwitcherModal
        open={showAccountSwitcher}
        onClose={() => setShowAccountSwitcher(false)}
        currentScope="tenant"
        currentTenantId={Number(user?.tenant_id || 0)}
        currentUserId={Number(user?.id || 0)}
        currentSessionKey={currentSessionKey}
        consoleUserUrl={consoleUserUrl}
        consoleTenantUrl={consoleTenantUrl}
        consoleAdminUrl={consoleAdminUrl}
      />
    </div>
  )
}
