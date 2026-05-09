import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { uiAlert, uiConfirm, uiPrompt } from '@contexts/DialogContext'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '@features/user/components/Layout'
import { formatPhoneForDisplay } from '@utils/phoneValidator'
import { 
  getSecurityStatus, 
  SecurityStatus, 
  enhancedChangePassword,
  startEmailChange,
  generateDeviceFingerprint,
  disable2FA,
  resendEmailVerification,
  resendPhoneVerification
} from '@api/user/security'
import { listPasskeys, PasskeyInfo } from '@api/oauth/passkey'
import { isPasskeySupported } from '@utils/webauthn'
import { 
  ShieldCheckIcon,
  KeyIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  CogIcon,
  LockClosedIcon,
  FingerPrintIcon
} from '@heroicons/react/24/outline'
import { PInput, PButton, PCard, PSkeleton, PAlert, PPageHeader } from '@ui'
import { ROUTES } from '@constants'
import { useI18n } from '@shared/i18n'

export default function SecuritySettings() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null)
  const [passkeys, setPasskeys] = useState<PasskeyInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // 
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })
  
  //  -> 
  const [showEmailChangeForm, setShowEmailChangeForm] = useState(false)
  const [emailChangeForm, setEmailChangeForm] = useState({
    new_email: '',
    current_password: ''
  })

  useEffect(() => {
    loadSecurityData()
  }, [])

  const loadSecurityData = async () => {
    try {
      setIsLoading(true)
      const [statusRes, passkeysData] = await Promise.all([
        getSecurityStatus(),
        listPasskeys().catch(() => [])
      ])
      
      setSecurityStatus(statusRes.data)
      setPasskeys(Array.isArray(passkeysData) ? passkeysData : [])
      setEmailChangeForm({
        new_email: '',
        current_password: ''
      })
      setError('')
    } catch (err: any) {
      setError(t('pages.userSecuritySettings.errors.loadFailed'))
      setPasskeys([]) // 
    } finally {
      setIsLoading(false)
    }
  }

  const calculateSecurityScore = () => {
    if (!securityStatus) return 0
    
    let score = 0
    if (securityStatus.password_set) score += 20
    if (securityStatus.two_fa_enabled) score += 30
    if (securityStatus.passkeys_count > 0) score += 25
    if (securityStatus.email_verified) score += 15
    if (securityStatus.phone_verified) score += 10
    
    return Math.min(score, 100)
  }

  const getSecurityLevel = (score: number) => {
    if (score >= 90) return { text: t('pages.userSecuritySettings.securityLevel.veryStrong'), color: 'text-green-600', bg: 'bg-green-100', bar: 'bg-green-500' }
    if (score >= 70) return { text: t('pages.userSecuritySettings.securityLevel.strong'), color: 'text-blue-600', bg: 'bg-blue-100', bar: 'bg-blue-500' }
    if (score >= 50) return { text: t('pages.userSecuritySettings.securityLevel.medium'), color: 'text-yellow-600', bg: 'bg-yellow-100', bar: 'bg-yellow-500' }
    return { text: t('pages.userSecuritySettings.securityLevel.weak'), color: 'text-red-600', bg: 'bg-red-100', bar: 'bg-red-500' }
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (passwordForm.new_password !== passwordForm.confirm_password) {
      setError(t('pages.userSecuritySettings.errors.passwordMismatch'))
      return
    }
    
    if (passwordForm.new_password.length < 8) {
      setError(t('pages.userSecuritySettings.errors.passwordTooShort'))
      return
    }

    try {
      const deviceFingerprint = generateDeviceFingerprint()
      await enhancedChangePassword({
        ...passwordForm,
        device_fingerprint: deviceFingerprint
      })
      setSuccess(t('pages.userSecuritySettings.success.passwordChanged'))
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
      setShowPasswordForm(false)
      await loadSecurityData()
    } catch (err: any) {
      setError(err.response?.data?.error || t('pages.userSecuritySettings.errors.passwordChangeFailed'))
    }
  }

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!emailChangeForm.new_email || !emailChangeForm.current_password) {
      setError(t('pages.userSecuritySettings.errors.formIncomplete'))
      return
    }
    
    if (emailChangeForm.new_email === securityStatus?.email) {
      setError(t('pages.userSecuritySettings.errors.emailSameAsCurrent'))
      return
    }

    try {
      await startEmailChange(emailChangeForm.new_email, emailChangeForm.current_password)
      setSuccess(t('pages.userSecuritySettings.success.emailChangeStarted'))
      setEmailChangeForm({ new_email: '', current_password: '' })
      setShowEmailChangeForm(false)
    } catch (err: any) {
      setError(err.response?.data?.error || t('pages.userSecuritySettings.errors.emailChangeFailed'))
    }
  }

  const handleDisable2FA = async () => {
    const code = await uiPrompt(t('pages.userSecuritySettings.twofa.disablePrompt'))
    if (!code) return

    try {
      await disable2FA(code)
      setSuccess(t('pages.userSecuritySettings.success.twofaDisabled'))
      await loadSecurityData()
    } catch (err: any) {
      setError(t('pages.userSecuritySettings.errors.twofaDisableFailed'))
    }
  }

  const handleResendVerification = async (type: 'email' | 'phone') => {
    try {
      if (type === 'email') {
        await resendEmailVerification()
        setSuccess(t('pages.userSecuritySettings.success.emailVerificationSent'))
      } else {
        await resendPhoneVerification()
        setSuccess(t('pages.userSecuritySettings.success.phoneVerificationSent'))
      }
    } catch (err: any) {
      setError(type === 'email' ? t('pages.userSecuritySettings.errors.sendEmailFailed') : t('pages.userSecuritySettings.errors.sendSmsFailed'))
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <PSkeleton.Content cards={2} />
      </div>
    )
  }

  if (!securityStatus) {
    return (
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="text-center text-red-600">{t('pages.userSecuritySettings.errors.loadFailed')}</div>
      </div>
    )
  }

  const securityScore = calculateSecurityScore()
  const securityLevel = getSecurityLevel(securityScore)

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-6">
          {/*  */}
          <PPageHeader title={t('pages.userSecuritySettings.header.title')} description={t('pages.userSecuritySettings.header.description')} />

          {/*  */}
          {error && <PAlert variant="error" message={error} dismissible onDismiss={() => setError('')} />}
          {success && <PAlert variant="success" message={success} dismissible onDismiss={() => setSuccess('')} />}

          {/*  */}
          <div className="rounded-xl bg-white shadow-sm">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg leading-6 font-medium text-gray-900">
                    {t('pages.userSecuritySettings.score.title')}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    {t('pages.userSecuritySettings.score.subtitle')}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-gray-900">{securityScore}</div>
                  <div className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${securityLevel.bg} ${securityLevel.color}`}>
                    {securityLevel.text}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <div className="bg-gray-200 rounded-full h-2">
                  <div 
                    className={`${securityLevel.bar} h-2 rounded-full transition-all duration-300`}
                    style={{ width: `${securityScore}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/*  */}
          <div className="rounded-xl bg-white shadow-sm">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-6">
                {t('pages.userSecuritySettings.authMethods.title')}
              </h3>
              
              <div className="space-y-6">
                {/*  */}
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <LockClosedIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-4">
                      <h4 className="text-sm font-medium text-gray-900">{t('pages.userSecuritySettings.password.title')}</h4>
                      <p className="text-sm text-gray-500">
                        {securityStatus.password_set ? t('pages.userSecuritySettings.password.set') : t('pages.userSecuritySettings.password.notSet')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {securityStatus.password_set && (
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    )}
                    <PButton
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowPasswordForm(!showPasswordForm)}
                      leftIcon={<CogIcon className="h-4 w-4" />}
                    >
                      {securityStatus.password_set ? t('pages.userSecuritySettings.password.change') : t('pages.userSecuritySettings.password.setup')}
                    </PButton>
                  </div>
                </div>

                {/*  */}
                {showPasswordForm && (
                  <form onSubmit={handlePasswordChange} className="bg-gray-50 p-4 rounded-lg space-y-4">
                    <PInput
                      type="password"
                      label={t('pages.userSecuritySettings.password.current')}
                      value={passwordForm.current_password}
                      onChange={(e) => setPasswordForm({...passwordForm, current_password: e.target.value})}
                      required
                      showPassword={showPasswords.current}
                      onTogglePassword={() => setShowPasswords({...showPasswords, current: !showPasswords.current})}
                    />
                    <PInput
                      type="password"
                      label={t('pages.userSecuritySettings.password.new')}
                      value={passwordForm.new_password}
                      onChange={(e) => setPasswordForm({...passwordForm, new_password: e.target.value})}
                      required
                      minLength={8}
                      showPassword={showPasswords.new}
                      onTogglePassword={() => setShowPasswords({...showPasswords, new: !showPasswords.new})}
                    />
                    <PInput
                      type="password"
                      label={t('pages.userSecuritySettings.password.confirm')}
                      value={passwordForm.confirm_password}
                      onChange={(e) => setPasswordForm({...passwordForm, confirm_password: e.target.value})}
                      required
                      showPassword={showPasswords.confirm}
                      onTogglePassword={() => setShowPasswords({...showPasswords, confirm: !showPasswords.confirm})}
                    />
                    <div className="flex space-x-3">
                      <PButton
                        type="submit"
                        variant="primary"
                      >
                        {t('pages.userSecuritySettings.password.submit')}
                      </PButton>
                      <PButton
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setShowPasswordForm(false)
                          setPasswordForm({ current_password: '', new_password: '', confirm_password: '' })
                        }}
                      >
                        {t('pages.userSecuritySettings.common.cancel')}
                      </PButton>
                    </div>
                  </form>
                )}

                {/* Passkey */}
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <FingerPrintIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-4">
                      <h4 className="text-sm font-medium text-gray-900">Passkey</h4>
                      <p className="text-sm text-gray-500">
                        {isPasskeySupported() 
                          ? t('pages.userSecuritySettings.passkey.registeredCount', { count: passkeys?.length || 0 })
                          : t('pages.userSecuritySettings.passkey.notSupported')
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {(passkeys?.length || 0) > 0 && (
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    )}
                    {isPasskeySupported() && (
                      <Link
                        to={ROUTES.user.securityPasskey}
                        className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium leading-4 text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        <CogIcon className="h-4 w-4 mr-1" />
                        {t('pages.userSecuritySettings.passkey.manage')}
                      </Link>
                    )}
                  </div>
                </div>

                {/*  */}
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <ShieldCheckIcon className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-4">
                      <h4 className="text-sm font-medium text-gray-900">{t('pages.userSecuritySettings.twofa.title')}</h4>
                      <p className="text-sm text-gray-500">
                        {securityStatus.two_fa_enabled ? t('pages.userSecuritySettings.twofa.enabled') : t('pages.userSecuritySettings.twofa.disabled')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {securityStatus.two_fa_enabled && (
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    )}
                    {securityStatus.two_fa_enabled ? (
                      <PButton
                        variant="danger"
                        size="sm"
                        onClick={handleDisable2FA}
                        leftIcon={<TrashIcon className="h-4 w-4" />}
                      >
                        {t('pages.userSecuritySettings.twofa.disable')}
                      </PButton>
                    ) : (
                      <Link to={ROUTES.user.securityTwoFA}>
                        <PButton variant="secondary" size="sm" leftIcon={<PlusIcon className="h-4 w-4" />}>
                          {t('pages.userSecuritySettings.twofa.enable')}
                        </PButton>
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/*  */}
          <div className="rounded-xl bg-white shadow-sm">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  {t('pages.userSecuritySettings.emailSection.title')}
                </h3>
                <PButton
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowEmailChangeForm(!showEmailChangeForm)}
                  leftIcon={<CogIcon className="h-4 w-4" />}
                >
                  {t('pages.userSecuritySettings.emailSection.changeEmail')}
                </PButton>
              </div>
              
              <div className="space-y-4">
                {/*  */}
                <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div className="flex items-center">
                    <EnvelopeIcon className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{securityStatus.email}</p>
                      <p className="text-sm text-gray-500">
                        {securityStatus.email_verified ? t('pages.userSecuritySettings.contact.verified') : t('pages.userSecuritySettings.contact.unverified')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {securityStatus.email_verified ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    ) : (
                      <>
                        <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />
                        <PButton variant="ghost" size="sm" onClick={() => handleResendVerification('email')}>
                          {t('pages.userSecuritySettings.contact.sendEmailVerification')}
                        </PButton>
                      </>
                    )}
                  </div>
                </div>

                {/*  */}
                {securityStatus.phone && (
                  <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                    <div className="flex items-center">
                      <DevicePhoneMobileIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{formatPhoneForDisplay(securityStatus.phone)}</p>
                        <p className="text-sm text-gray-500">
                          {securityStatus.phone_verified ? t('pages.userSecuritySettings.contact.verified') : t('pages.userSecuritySettings.contact.unverified')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {securityStatus.phone_verified ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-500" />
                      ) : (
                        <>
                          <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500" />
                          <PButton variant="ghost" size="sm" onClick={() => handleResendVerification('phone')}>
                            {t('pages.userSecuritySettings.contact.sendSmsVerification')}
                          </PButton>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/*  */}
              {showEmailChangeForm && (
                <form onSubmit={handleEmailChange} className="mt-6 bg-gray-50 p-4 rounded-lg space-y-4">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <ShieldCheckIcon className="h-5 w-5 text-blue-400" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-blue-800">{t('pages.userSecuritySettings.emailChange.flowTitle')}</h3>
                        <div className="mt-2 text-sm text-blue-700">
                          <p>{t('pages.userSecuritySettings.emailChange.step1')}</p>
                          <p>{t('pages.userSecuritySettings.emailChange.step2')}</p>
                          <p>{t('pages.userSecuritySettings.emailChange.step3')}</p>
                          <p>{t('pages.userSecuritySettings.emailChange.step4')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <PInput
                    type="email"
                    label={t('pages.userSecuritySettings.emailChange.newEmailLabel')}
                    value={emailChangeForm.new_email}
                    onChange={(e) => setEmailChangeForm({...emailChangeForm, new_email: e.target.value})}
                    required
                    placeholder={t('pages.userSecuritySettings.emailChange.newEmailPlaceholder')}
                  />
                  <PInput
                    type="password"
                    label={t('pages.userSecuritySettings.emailChange.currentPasswordLabel')}
                    value={emailChangeForm.current_password}
                    onChange={(e) => setEmailChangeForm({...emailChangeForm, current_password: e.target.value})}
                    required
                    placeholder={t('pages.userSecuritySettings.emailChange.currentPasswordPlaceholder')}
                  />
                  <div className="flex space-x-3">
                    <PButton
                      type="submit"
                      variant="primary"
                    >
                      {t('pages.userSecuritySettings.emailChange.submit')}
                    </PButton>
                    <PButton
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setShowEmailChangeForm(false)
                        setEmailChangeForm({ new_email: '', current_password: '' })
                      }}
                    >
                      {t('pages.userSecuritySettings.common.cancel')}
                    </PButton>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/*  */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <ShieldCheckIcon className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">{t('pages.userSecuritySettings.tips.title')}</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <ul className="list-disc list-inside space-y-1">
                    {!securityStatus.two_fa_enabled && (
                      <li>{t('pages.userSecuritySettings.tips.enable2fa')}</li>
                    )}
                    {(passkeys?.length || 0) === 0 && isPasskeySupported() && (
                      <li>{t('pages.userSecuritySettings.tips.setupPasskey')}</li>
                    )}
                    {!securityStatus.email_verified && (
                      <li>{t('pages.userSecuritySettings.tips.verifyEmail')}</li>
                    )}
                    {!securityStatus.phone && (
                      <li>{t('pages.userSecuritySettings.tips.addPhone')}</li>
                    )}
                    <li>{t('pages.userSecuritySettings.tips.reviewSettings')}</li>
                    <li>{t('pages.userSecuritySettings.tips.strongPassword')}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <Link to={ROUTES.user.securityLoginHistory} className="block">
              <PCard variant="bordered" hoverable className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-3 rounded-lg bg-indigo-50 text-indigo-600">
                    {/*  */}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                      <path fillRule="evenodd" d="M12 2.25a9.75 9.75 0 1 0 9.75 9.75A9.761 9.761 0 0 0 12 2.25Zm.75 5.25a.75.75 0 0 0-1.5 0v4.5c0 .199.079.39.22.53l3 3a.75.75 0 1 0 1.06-1.06l-2.78-2.78V7.5Z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-medium text-gray-900">{t('pages.userSecuritySettings.loginHistory.title')}</h3>
                    <p className="mt-1 text-sm text-gray-500">{t('pages.userSecuritySettings.loginHistory.description')}</p>
                  </div>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-gray-400">
                  <path fillRule="evenodd" d="M8.47 4.47a.75.75 0 0 1 1.06 0l6 6a.75.75 0 0 1 0 1.06l-6 6a.75.75 0 1 1-1.06-1.06L13.94 12 8.47 6.53a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                </svg>
              </PCard>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  )
} 
