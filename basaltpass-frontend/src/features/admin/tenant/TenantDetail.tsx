import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { uiAlert, uiConfirm, uiPrompt } from '@contexts/DialogContext'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  BuildingOfficeIcon, 
  DocumentTextIcon,
  CogIcon,
  LinkIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  UserIcon,
  PencilIcon,
  TrashIcon,
  ChartBarIcon,
  CubeIcon,
  KeyIcon
} from '@heroicons/react/24/outline'
import AdminLayout from '@features/admin/components/AdminLayout'
import { PInput, PSelect, PTextarea, PCheckbox, PButton, PSkeleton, PBadge, PAlert, PCard, PPageHeader } from '@ui'
import {
  adminTenantApi,
  AdminTenantDetailResponse,
  AdminUpdateTenantRequest,
  TenantAuthSettings,
  TenantSettings,
} from '@api/admin/tenant'
import { ROUTES } from '@constants'
import { useI18n } from '@shared/i18n'

const TenantDetail: React.FC = () => {
  const { t, locale } = useI18n()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState<AdminTenantDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [authSettings, setAuthSettings] = useState<TenantAuthSettings | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authSaving, setAuthSaving] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [formData, setFormData] = useState<AdminUpdateTenantRequest>({
    name: '',
    description: '',
    status: 'active',
    settings: {
      max_users: 100,
      max_apps: 10,
      max_tokens_per_hour: 1000,
      max_storage: 1024,
      enable_api: true,
      enable_sso: false,
      enable_audit: false,
    }
  })

  useEffect(() => {
    if (id) {
      fetchTenantDetail()
    }
  }, [id])

  const fetchTenantDetail = async () => {
    if (!id) return
    
    try {
      setLoading(true)
      setError(null)
      const response = await adminTenantApi.getTenantDetail(parseInt(id))
      setTenant(response)
      
      setFormData({
        name: response.name,
        description: response.description || '',
        status: response.status,
        settings: response.settings || {
          max_users: 100,
          max_apps: 10,
          max_tokens_per_hour: 1000,
          max_storage: 1024,
          enable_api: true,
          enable_sso: false,
          enable_audit: false,
        }
      })

      await fetchTenantAuthSettings(parseInt(id))
    } catch (err: any) {
      console.error(t('adminTenantDetail.logs.fetchDetailFailed'), err)
      setError(err.response?.data?.message || t('adminTenantDetail.errors.fetchDetailFailed'))
    } finally {
      setLoading(false)
    }
  }

  const fetchTenantAuthSettings = async (tenantID: number) => {
    try {
      setAuthLoading(true)
      setAuthError(null)
      const settings = await adminTenantApi.getTenantAuthSettings(tenantID)
      setAuthSettings(settings)
    } catch (err: any) {
      console.error('Failed to fetch tenant auth settings', err)
      setAuthError(err.response?.data?.error || t('adminTenantDetail.auth.loadFailed'))
      setAuthSettings(null)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleAuthSettingChange = (key: 'allow_registration' | 'allow_login', checked: boolean) => {
    setAuthSettings(prev => {
      if (!prev) {
        return prev
      }
      return {
        ...prev,
        [key]: checked,
      }
    })
  }

  const handleSaveAuthSettings = async () => {
    if (!id || !authSettings) return

    try {
      setAuthSaving(true)
      setAuthError(null)
      const updated = await adminTenantApi.updateTenantAuthSettings(parseInt(id), {
        allow_registration: authSettings.allow_registration,
        allow_login: authSettings.allow_login,
      })
      setAuthSettings(updated)
      uiAlert(t('adminTenantDetail.auth.updateSuccess'))
    } catch (err: any) {
      console.error('Failed to save tenant auth settings', err)
      const message = err.response?.data?.error || t('adminTenantDetail.auth.updateFailed')
      setAuthError(message)
    } finally {
      setAuthSaving(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSettingChange = (key: keyof TenantSettings, value: any) => {
    setFormData(prev => ({
      ...prev,
      settings: {
        ...prev.settings!,
        [key]: value
      }
    }))
  }

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id) return
    
    try {
      setUpdating(true)
      setError(null)
      
      await adminTenantApi.updateTenant(parseInt(id), formData)
      
      await fetchTenantDetail()
      setEditMode(false)
    } catch (err: any) {
      console.error(t('adminTenantDetail.logs.updateFailed'), err)
      setError(err.response?.data?.message || t('adminTenantDetail.errors.updateFailed'))
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !tenant) return
    
    if (!await uiConfirm(t('adminTenantDetail.confirm.delete', { name: tenant.name }))) {
      return
    }
    
    try {
      setUpdating(true)
      setError(null)
      
      await adminTenantApi.deleteTenant(parseInt(id))
      
      navigate(ROUTES.admin.tenants, { 
        state: { message: t('adminTenantDetail.messages.deleteSuccess') }
      })
    } catch (err: any) {
      console.error(t('adminTenantDetail.logs.deleteFailed'), err)
      setError(err.response?.data?.message || t('adminTenantDetail.errors.deleteFailed'))
    } finally {
      setUpdating(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: { variant: 'success' as const, text: t('adminTenantDetail.status.active') },
      suspended: { variant: 'warning' as const, text: t('adminTenantDetail.status.suspended') },
      deleted: { variant: 'error' as const, text: t('adminTenantDetail.status.deleted') }
    }
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.active
    return <PBadge variant={config.variant}>{config.text}</PBadge>
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) {
      return t('adminTenantDetail.common.emptyValue')
    }
    return new Date(dateString).toLocaleString(locale)
  }

  const formatNumber = (value?: number | null) => {
    return new Intl.NumberFormat(locale).format(value ?? 0)
  }

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      setCopiedField(null)
    }
  }

  const userConsoleBaseUrl = useMemo(() => {
    const configured = (import.meta as any).env?.VITE_CONSOLE_USER_URL
    if (configured && typeof configured === 'string') {
      return configured.replace(/\/+$/, '')
    }
    if (typeof window !== 'undefined') {
      return window.location.origin
    }
    return ''
  }, [])

  const tenantLoginUrl = useMemo(() => {
    if (!tenant?.code || !userConsoleBaseUrl) {
      return ''
    }
    return `${userConsoleBaseUrl}/auth/tenant/${tenant.code}/login`
  }, [tenant?.code, userConsoleBaseUrl])

  const tenantRegisterUrl = useMemo(() => {
    if (!tenant?.code || !userConsoleBaseUrl) {
      return ''
    }
    return `${userConsoleBaseUrl}/auth/tenant/${tenant.code}/register`
  }, [tenant?.code, userConsoleBaseUrl])

  const tenantJoinUrl = useMemo(() => {
    if (!tenant?.code || !userConsoleBaseUrl) {
      return ''
    }
    return `${userConsoleBaseUrl}/auth/tenant/${tenant.code}/join`
  }, [tenant?.code, userConsoleBaseUrl])

  if (loading) {
    return (
      <AdminLayout title={t('adminTenantDetail.layoutTitle')}>
        <div className="py-6">
          <PSkeleton.DetailPage />
        </div>
      </AdminLayout>
    )
  }

  if (!tenant) {
    return (
      <AdminLayout title={t('adminTenantDetail.layoutTitle')}>
        <div className="text-center py-12">
          <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">{t('adminTenantDetail.notFound.title')}</h3>
          <p className="mt-1 text-sm text-gray-500">{t('adminTenantDetail.notFound.description')}</p>
          <div className="mt-6">
            <PButton onClick={() => navigate(ROUTES.admin.tenants)}>
              {t('adminTenantDetail.actions.backToList')}
            </PButton>
          </div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title={t('adminTenantDetail.layoutTitleWithName', { name: tenant.name })}>
      <div className="space-y-6">
        {error && <PAlert variant="error" title={t('adminTenantDetail.errors.operationFailed')} message={error} />}

        <div className="lg:flex lg:items-center lg:justify-between">
          <div className="flex-1 min-w-0">
            <PPageHeader
              title={tenant.name}
              description={t('adminTenantDetail.meta.code', { code: tenant.code })}
              icon={<BuildingOfficeIcon className="h-8 w-8 text-indigo-600" />}
            />
            <div className="mt-2 flex items-center space-x-2">
              {getStatusBadge(tenant.status)}
            </div>
          </div>
          <div className="mt-5 flex lg:mt-0 lg:ml-4 space-x-3">
            <PButton
              onClick={() => navigate(ROUTES.admin.tenantRbacFor(tenant.id))}
              disabled={updating}
              variant="secondary"
            >
              <span className="inline-flex items-center">
                <KeyIcon className="h-4 w-4 mr-2" />
                Tenant RBAC
              </span>
            </PButton>
            <PButton
              onClick={() => setEditMode(!editMode)}
              disabled={updating}
              variant="secondary"
            >
              <span className="inline-flex items-center">
                <PencilIcon className="h-4 w-4 mr-2" />
                {editMode ? t('adminTenantDetail.actions.cancelEdit') : t('adminTenantDetail.actions.edit')}
              </span>
            </PButton>
            <PButton
              onClick={handleDelete}
              disabled={updating}
              variant="danger"
            >
              <span className="inline-flex items-center">
                <TrashIcon className="h-4 w-4 mr-2" />
                {t('adminTenantDetail.actions.delete')}
              </span>
            </PButton>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <PCard className="rounded-xl p-0 shadow-sm">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
                  <DocumentTextIcon className="h-5 w-5 mr-2 text-gray-400" />
                  {t('adminTenantDetail.sections.basicInfo')}
                </h3>
                
                {editMode ? (
                  <form onSubmit={handleUpdate} className="space-y-4">
                    <div>
                      <PInput
                        label={t('adminTenantDetail.form.name')}
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        required
                      />
                    </div>

                    <div>
                      <PTextarea
                        label={t('adminTenantDetail.form.description')}
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        rows={3}
                        placeholder={t('adminTenantDetail.form.descriptionPlaceholder')}
                      />
                    </div>

                    <div>
                      <PSelect
                        label={t('adminTenantDetail.form.status')}
                        name="status"
                        value={formData.status}
                        onChange={handleInputChange}
                      >
                        <option value="active">{t('adminTenantDetail.status.active')}</option>
                        <option value="suspended">{t('adminTenantDetail.status.suspended')}</option>
                        <option value="deleted">{t('adminTenantDetail.status.deleted')}</option>
                      </PSelect>
                    </div>

                    <div className="flex justify-end space-x-3">
                      <PButton
                        type="button"
                        variant="secondary"
                        onClick={() => setEditMode(false)}
                      >
                        {t('adminTenantDetail.actions.cancel')}
                      </PButton>
                      <PButton
                        type="submit"
                        loading={updating}
                      >
                        {t('adminTenantDetail.actions.save')}
                      </PButton>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.meta.tenantCode')}</dt>
                      <dd className="mt-1 text-sm text-gray-900 font-mono">{tenant.code}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.meta.description')}</dt>
                      <dd className="mt-1 text-sm text-gray-900">
                        {tenant.description || t('adminTenantDetail.common.noDescription')}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.meta.ownerEmail')}</dt>
                      <dd className="mt-1 text-sm text-gray-900">{tenant.owner_email}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500 mb-2 flex items-center">
                        <LinkIcon className="h-4 w-4 mr-2 text-blue-500" />
                        {t('adminTenantDetail.meta.accessLinks')}
                      </dt>
                      <dd className="space-y-3">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">{t('adminTenantDetail.meta.joinUrl')}</div>
                          <div className="flex items-center space-x-2">
                            <PInput type="text" readOnly value={tenantJoinUrl} className="flex-1 bg-gray-50 font-mono text-gray-600" />
                            <PButton
                              type="button"
                              variant="secondary"
                              onClick={() => copyToClipboard(tenantJoinUrl, 'join')}
                              title={t('adminTenantDetail.actions.copyLink')}
                            >
                              {copiedField === 'join' ? <CheckCircleIcon className="h-5 w-5 text-green-500" /> : <ClipboardDocumentIcon className="h-5 w-5" />}
                            </PButton>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">{t('adminTenantDetail.meta.loginUrl')}</div>
                          <div className="flex items-center space-x-2">
                            <PInput type="text" readOnly value={tenantLoginUrl} className="flex-1 bg-gray-50 font-mono text-gray-600" />
                            <PButton
                              type="button"
                              variant="secondary"
                              onClick={() => copyToClipboard(tenantLoginUrl, 'login')}
                              title={t('adminTenantDetail.actions.copyLink')}
                            >
                              {copiedField === 'login' ? <CheckCircleIcon className="h-5 w-5 text-green-500" /> : <ClipboardDocumentIcon className="h-5 w-5" />}
                            </PButton>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">{t('adminTenantDetail.meta.registerUrl')}</div>
                          <div className="flex items-center space-x-2">
                            <PInput type="text" readOnly value={tenantRegisterUrl} className="flex-1 bg-gray-50 font-mono text-gray-600" />
                            <PButton
                              type="button"
                              variant="secondary"
                              onClick={() => copyToClipboard(tenantRegisterUrl, 'register')}
                              title={t('adminTenantDetail.actions.copyLink')}
                            >
                              {copiedField === 'register' ? <CheckCircleIcon className="h-5 w-5 text-green-500" /> : <ClipboardDocumentIcon className="h-5 w-5" />}
                            </PButton>
                          </div>
                        </div>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.meta.createdAt')}</dt>
                      <dd className="mt-1 text-sm text-gray-900">{formatDate(tenant.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.meta.updatedAt')}</dt>
                      <dd className="mt-1 text-sm text-gray-900">{formatDate(tenant.updated_at)}</dd>
                    </div>
                  </div>
                )}
              </div>
            </PCard>

            <PCard className="mt-6 rounded-xl p-0 shadow-sm">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
                  <CogIcon className="h-5 w-5 mr-2 text-gray-400" />
                  {t('adminTenantDetail.sections.settings')}
                </h3>
                
                {editMode ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <PInput
                          label={t('adminTenantDetail.settings.maxUsers')}
                          type="number"
                          value={formData.settings?.max_users || 0}
                          onChange={(e) => handleSettingChange('max_users', parseInt(e.target.value) || 0)}
                          min={0}
                        />
                      </div>
                      <div>
                        <PInput
                          label={t('adminTenantDetail.settings.maxApps')}
                          type="number"
                          value={formData.settings?.max_apps || 0}
                          onChange={(e) => handleSettingChange('max_apps', parseInt(e.target.value) || 0)}
                          min={0}
                        />
                      </div>
                      <div>
                        <PInput
                          label={t('adminTenantDetail.settings.maxStorage')}
                          type="number"
                          value={formData.settings?.max_storage || 0}
                          onChange={(e) => handleSettingChange('max_storage', parseInt(e.target.value) || 0)}
                          min={0}
                        />
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <PCheckbox
                        variant="switch"
                        label={t('adminTenantDetail.settings.enableApi')}
                        checked={formData.settings?.enable_api || false}
                        onChange={(e) => handleSettingChange('enable_api', (e.target as HTMLInputElement).checked)}
                      />
                      <PCheckbox
                        variant="switch"
                        label={t('adminTenantDetail.settings.enableSso')}
                        checked={formData.settings?.enable_sso || false}
                        onChange={(e) => handleSettingChange('enable_sso', (e.target as HTMLInputElement).checked)}
                      />
                      <PCheckbox
                        variant="switch"
                        label={t('adminTenantDetail.settings.enableAudit')}
                        checked={formData.settings?.enable_audit || false}
                        onChange={(e) => handleSettingChange('enable_audit', (e.target as HTMLInputElement).checked)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.settings.maxUsers')}</dt>
                        <dd className="mt-1 text-lg font-semibold text-gray-900">
                          {tenant.settings?.max_users || 0}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.settings.maxApps')}</dt>
                        <dd className="mt-1 text-lg font-semibold text-gray-900">
                          {tenant.settings?.max_apps || 0}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.settings.maxStorageSimple')}</dt>
                        <dd className="mt-1 text-lg font-semibold text-gray-900">
                          {t('adminTenantDetail.settings.maxStorageValue', { value: tenant.settings?.max_storage || 0 })}
                        </dd>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.settings.apiFeature')}</dt>
                        <dd className="mt-1">
                          {tenant.settings?.enable_api ? (
                            <CheckCircleIcon className="h-5 w-5 text-green-500" />
                          ) : (
                            <span className="text-gray-400">{t('adminTenantDetail.common.disabled')}</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.settings.ssoFeature')}</dt>
                        <dd className="mt-1">
                          {tenant.settings?.enable_sso ? (
                            <CheckCircleIcon className="h-5 w-5 text-green-500" />
                          ) : (
                            <span className="text-gray-400">{t('adminTenantDetail.common.disabled')}</span>
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.settings.auditFeature')}</dt>
                        <dd className="mt-1">
                          {tenant.settings?.enable_audit ? (
                            <CheckCircleIcon className="h-5 w-5 text-green-500" />
                          ) : (
                            <span className="text-gray-400">{t('adminTenantDetail.common.disabled')}</span>
                          )}
                        </dd>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </PCard>

            <PCard className="mt-6 rounded-xl p-0 shadow-sm">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
                  <CogIcon className="h-5 w-5 mr-2 text-gray-400" />
                  {t('adminTenantDetail.auth.title')}
                </h3>

                {authError && (
                  <PAlert
                    variant="error"
                    title={t('adminTenantDetail.auth.loadFailedTitle')}
                    message={authError}
                    className="mb-4"
                  />
                )}

                {authLoading ? (
                  <div className="space-y-3">
                    <PSkeleton variant="text" lines={2} />
                  </div>
                ) : authSettings ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <PCheckbox
                        variant="switch"
                        label={t('adminTenantDetail.auth.allowRegistration')}
                        checked={authSettings.allow_registration}
                        onChange={(e) => handleAuthSettingChange('allow_registration', (e.target as HTMLInputElement).checked)}
                        disabled={authSaving}
                      />
                      <p className="mt-2 text-sm text-gray-500">
                        {t('adminTenantDetail.auth.registrationHint')}
                      </p>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <PCheckbox
                        variant="switch"
                        label={t('adminTenantDetail.auth.allowLogin')}
                        checked={authSettings.allow_login}
                        onChange={(e) => handleAuthSettingChange('allow_login', (e.target as HTMLInputElement).checked)}
                        disabled={authSaving}
                      />
                      <p className="mt-2 text-sm text-gray-500">
                        {t('adminTenantDetail.auth.loginHint')}
                      </p>
                    </div>

                    {(!authSettings.allow_registration || !authSettings.allow_login) && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        {t('adminTenantDetail.auth.warning')}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <span>{t('adminTenantDetail.auth.registration')}</span>
                        <PBadge variant={authSettings.allow_registration ? 'success' : 'warning'}>
                          {authSettings.allow_registration ? t('adminTenantDetail.auth.enabled') : t('adminTenantDetail.auth.disabled')}
                        </PBadge>
                        <span>{t('adminTenantDetail.auth.login')}</span>
                        <PBadge variant={authSettings.allow_login ? 'success' : 'warning'}>
                          {authSettings.allow_login ? t('adminTenantDetail.auth.enabled') : t('adminTenantDetail.auth.disabled')}
                        </PBadge>
                      </div>
                      <PButton onClick={handleSaveAuthSettings} loading={authSaving} disabled={authLoading || !authSettings}>
                        {t('adminTenantDetail.auth.save')}
                      </PButton>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">{t('adminTenantDetail.auth.empty')}</div>
                )}
              </div>
            </PCard>
          </div>

          <div className="space-y-6">
            <PCard className="rounded-xl p-0 shadow-sm">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
                  <ChartBarIcon className="h-5 w-5 mr-2 text-gray-400" />
                  {t('adminTenantDetail.sections.statistics')}
                </h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.stats.userCount')}</dt>
                    <dd className="mt-1 text-2xl font-semibold text-indigo-600">
                      {formatNumber(tenant.user_count)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.stats.appCount')}</dt>
                    <dd className="mt-1 text-2xl font-semibold text-indigo-600">
                      {formatNumber(tenant.app_count)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.stats.storageUsed')}</dt>
                    <dd className="mt-1 text-2xl font-semibold text-green-600">
                      {t('adminTenantDetail.stats.storageUsedValue', { value: formatNumber(tenant.stats?.storage_used) })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.stats.apiCallsThisMonth')}</dt>
                    <dd className="mt-1 text-2xl font-semibold text-blue-600">
                      {formatNumber(tenant.stats?.api_calls_this_month)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-gray-500">{t('adminTenantDetail.stats.lastActiveAt')}</dt>
                    <dd
                      className={`mt-1 text-lg font-semibold ${
                        tenant.stats?.last_active_at ? 'text-gray-700' : 'text-gray-400'
                      }`}
                    >
                      {tenant.stats?.last_active_at ? formatDate(tenant.stats.last_active_at) : t('adminTenantDetail.common.emptyValue')}
                    </dd>
                  </div>
                </div>
              </div>
            </PCard>

            <PCard className="rounded-xl p-0 shadow-sm">
              <div className="px-4 py-5 sm:p-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4 flex items-center">
                  <CubeIcon className="h-5 w-5 mr-2 text-gray-400" />
                  {t('adminTenantDetail.sections.apps')}
                </h3>
                {tenant.recent_apps && tenant.recent_apps.length > 0 ? (
                  <div className="space-y-3">
                    {tenant.recent_apps.map((app) => (
                      <div key={app.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3 transition-colors hover:bg-gray-100">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <CubeIcon className="h-6 w-6 text-indigo-600" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{app.name}</p>
                            <p className="text-xs text-gray-500">{app.type}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">{t('adminTenantDetail.meta.createdAtLabel')}</p>
                          <p className="text-xs text-gray-900">{new Date(app.created_at).toLocaleDateString(locale)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500 text-sm">
                    {t('adminTenantDetail.empty.noApps')}
                  </div>
                )}
              </div>
            </PCard>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

export default TenantDetail
