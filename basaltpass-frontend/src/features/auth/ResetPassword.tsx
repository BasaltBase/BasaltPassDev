import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import client from '@api/client'
import { PInput, PButton, PAlert } from '@ui'
import { ROUTES } from '@constants'
import { useI18n } from '@shared/i18n'
import { useConfig } from '@contexts/ConfigContext'

function ResetPassword() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const { siteName, siteInitial, setPageTitle } = useConfig()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  
  const [step, setStep] = useState<'request' | 'reset'>(!token ? 'request' : 'reset')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const titleKey = step === 'request'
      ? 'auth.resetPassword.request.title'
      : 'auth.resetPassword.reset.title'
    setPageTitle(t(titleKey))
  }, [setPageTitle, step, t])

  const renderShell = (subtitle: string, title: string, description: string, content: ReactNode) => (
    <div className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <div className="w-full rounded-2xl border border-gray-200 bg-white px-6 py-8 shadow-sm sm:px-8">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900">
                <span className="text-sm font-semibold text-white">{siteInitial}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{siteName}</p>
                <p className="text-xs text-gray-500">{subtitle}</p>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
              <p className="mt-2 text-sm text-gray-600">{description}</p>
            </div>
          </div>

          {content}
        </div>
      </div>
    </div>
  )

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    
    try {
      await client.post('/api/v1/security/password/reset', { email })
      setSuccess(t('auth.resetPassword.request.success'))
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth.resetPassword.request.failed'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (newPassword !== confirmPassword) {
      setError(t('auth.resetPassword.reset.passwordMismatch'))
      return
    }
    
    setIsLoading(true)
    setError('')
    
    try {
      await client.post('/api/v1/security/password/reset/confirm', {
        token,
        new_password: newPassword
      })
      setSuccess(t('auth.resetPassword.reset.success'))
      setTimeout(() => navigate(ROUTES.user.login), 2000)
    } catch (err: any) {
      setError(err.response?.data?.error || t('auth.resetPassword.reset.failed'))
    } finally {
      setIsLoading(false)
    }
  }

  if (step === 'request') {
    return renderShell(
      t('auth.resetPassword.request.title'),
      t('auth.resetPassword.request.title'),
      t('auth.resetPassword.request.description'),
      success ? (
        <div className="mt-6">
          <PAlert variant="success" message={success} />
        </div>
      ) : (
        <form className="mt-6 space-y-6" onSubmit={handleRequestReset}>
          <div>
            <PInput
              label={t('auth.resetPassword.request.emailLabel')}
              type="email"
              value={email}
              onChange={setEmail}
              placeholder={t('auth.resetPassword.request.emailPlaceholder')}
              required
            />
          </div>

          {error && <PAlert variant="error" message={error} />}

          <div>
            <PButton
              type="submit"
              variant="primary"
              fullWidth
              loading={isLoading}
            >
              {t('auth.resetPassword.request.submit')}
            </PButton>
          </div>

          <div className="text-center">
            <PButton type="button" variant="ghost" onClick={() => navigate(ROUTES.user.login)}>
              {t('auth.resetPassword.actions.backToLogin')}
            </PButton>
          </div>
        </form>
      ),
    )
  }

  return renderShell(
    t('auth.resetPassword.reset.title'),
    t('auth.resetPassword.reset.title'),
    t('auth.resetPassword.reset.description'),
    success ? (
      <div className="mt-6">
        <PAlert variant="success" message={success} />
      </div>
    ) : (
      <form className="mt-6 space-y-6" onSubmit={handleResetPassword}>
        <div>
          <PInput
            label={t('auth.resetPassword.reset.newPasswordLabel')}
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            placeholder={t('auth.resetPassword.reset.newPasswordPlaceholder')}
            required
          />
        </div>

        <div>
          <PInput
            label={t('auth.resetPassword.reset.confirmPasswordLabel')}
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder={t('auth.resetPassword.reset.confirmPasswordPlaceholder')}
            required
          />
        </div>

        {error && <PAlert variant="error" message={error} />}

        <div>
          <PButton
            type="submit"
            variant="primary"
            fullWidth
            loading={isLoading}
          >
            {t('auth.resetPassword.reset.submit')}
          </PButton>
        </div>
      </form>
    ),
  )
}

export default ResetPassword