import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  BellIcon, 
  XMarkIcon,
  CheckIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import { 
  BellIcon as BellIconSolid 
} from '@heroicons/react/24/solid'
import { useNotifications }                   from '../contexts/NotificationContext'

type DropdownDirection = 'down' | 'up'
type DropdownAlign = 'left' | 'right'

interface EnhancedNotificationIconProps {
  viewAllPath?: string
  dropdownDirection?: DropdownDirection
  dropdownAlign?: DropdownAlign
}

// translatednotificationtranslatedcomponent，translatedNotificationProvider
// canconfig“translatednotification”translated，default /notifications
const EnhancedNotificationIcon: React.FC<EnhancedNotificationIconProps> = ({
  viewAllPath = '/notifications',
  dropdownDirection = 'down',
  dropdownAlign = 'right',
}) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelOffsetX, setPanelOffsetX] = useState(0)
  const navigate = useNavigate()

  const dropdownPositionClass =
    dropdownDirection === 'up'
      ? 'bottom-full mb-2'
      : 'top-full mt-2'
  const dropdownAlignClass = dropdownAlign === 'left' ? 'left-0' : 'right-0'
  const dropdownOriginClass =
    dropdownDirection === 'up'
      ? dropdownAlign === 'left'
        ? 'origin-bottom-left'
        : 'origin-bottom-right'
      : dropdownAlign === 'left'
        ? 'origin-top-left'
        : 'origin-top-right'

  // translated
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      setPanelOffsetX(0)
      return
    }

    const viewportPadding = 8

    const updatePanelOffset = () => {
      const panel = panelRef.current
      if (!panel) return

      const rect = panel.getBoundingClientRect()
      let offset = 0

      if (rect.left < viewportPadding) {
        offset += viewportPadding - rect.left
      }

      if (rect.right > window.innerWidth - viewportPadding) {
        offset -= rect.right - (window.innerWidth - viewportPadding)
      }

      setPanelOffsetX(Math.round(offset))
    }

    const rafId = requestAnimationFrame(updatePanelOffset)
    window.addEventListener('resize', updatePanelOffset)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('resize', updatePanelOffset)
    }
  }, [isOpen, dropdownAlign, dropdownDirection, notifications.length])

  const handleNotificationClick = async (notificationId: number) => {
    if (!notifications.find(n => n.id === notificationId)?.is_read) {
      await markAsRead(notificationId)
    }
    setIsOpen(false)
  }

  const handleViewAllNotifications = () => {
    setIsOpen(false)
    navigate(viewAllPath)
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <div className="w-2 h-2 bg-green-500 rounded-full"></div>
      case 'warning':
        return <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
      case 'error':
        return <div className="w-2 h-2 bg-red-500 rounded-full"></div>
      default:
        return <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 1) return 'translated'
    if (diffInMinutes < 60) return `${diffInMinutes}translated`
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}translated`
    return date.toLocaleDateString()
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg p-0 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-white"
        aria-label="View notifications"
      >
        {unreadCount > 0 ? (
          <BellIconSolid className="h-6 w-6" />
        ) : (
          <BellIcon className="h-6 w-6" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className={`absolute z-50 w-80 max-w-[calc(100vw-1rem)] rounded-xl bg-white shadow-lg ring-1 ring-black ring-opacity-5 ${dropdownAlignClass} ${dropdownPositionClass} ${dropdownOriginClass}`}
          style={panelOffsetX !== 0 ? { transform: `translateX(${panelOffsetX}px)` } : undefined}
        >
          <div className="py-2">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900">notification</h3>
              <div className="flex items-center space-x-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    translatedalreadytranslated
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500">
                  <BellIcon className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                  <p className="text-sm">translatednonenotification</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`px-4 py-3 hover:bg-gray-50 cursor-pointer ${
                        !notification.is_read ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => handleNotificationClick(notification.id)}
                    >
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 mt-1">
                          {getTypeIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className={`text-sm font-medium ${
                              !notification.is_read ? 'text-gray-900' : 'text-gray-600'
                            }`}>
                              {notification.title}
                            </p>
                            <div className="flex items-center space-x-1">
                              {!notification.is_read && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    markAsRead(notification.id)
                                  }}
                                  className="text-gray-400 hover:text-green-600"
                                >
                                  <CheckIcon className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteNotification(notification.id)
                                }}
                                className="text-gray-400 hover:text-red-600"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {notification.content}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatTime(notification.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-200">
                <button
                  onClick={handleViewAllNotifications}
                  className="w-full text-sm text-blue-600 hover:text-blue-800 text-center"
                >
                  translatednotification
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default EnhancedNotificationIcon 
