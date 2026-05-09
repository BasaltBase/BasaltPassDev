import React, { forwardRef } from 'react'
import { HTMLAttributes } from 'react'

interface PCardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * translated
   * - default: defaultstyle，translated
   * - bordered: translatedstyle
   * - elevated: translatedstyle，translated
   */
  variant?: 'default' | 'bordered' | 'elevated'
  
  /**
   * translated
   * - sm: translated，translated
   * - md: translated（default）
   * - lg: translated，translated
   */
  size?: 'sm' | 'md' | 'lg'
  
  /**
   * isnocantranslated
   */
  hoverable?: boolean
  
  /**
   * translated
   */
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
}

const PCard = forwardRef<HTMLDivElement, PCardProps>(
  ({ 
    className = '', 
    variant = 'default', 
    size = 'md',
    hoverable = false,
    padding,
    children,
    ...props 
  }, ref) => {
    
    // translatedstyle
    const variantClasses = {
      default: 'bg-white shadow-sm dark:bg-gray-900 dark:text-gray-100 dark:shadow-none dark:ring-1 dark:ring-white/10',
      bordered: 'bg-white border border-gray-200 shadow-sm dark:border-white/10 dark:bg-gray-900 dark:text-gray-100 dark:shadow-none',
      elevated: 'bg-white shadow-md dark:bg-gray-900 dark:text-gray-100 dark:shadow-none dark:ring-1 dark:ring-white/10'
    }
    
    // translatedstyle（translatedhastranslated padding translated）
    const sizeClasses = {
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6'
    }
    
    // translatedstyle
    const paddingClasses = {
      none: 'p-0',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
      xl: 'p-8'
    }
    
    // translated
    const hoverClasses = hoverable 
      ? 'transition-shadow duration-200 hover:shadow-lg' 
      : ''
    
    // translatedhastranslated
    const combinedClasses = [
      // translatedstyle：translatedandtranslated
      'rounded-xl',
      'max-w-full',
      'overflow-x-auto',
      // translatedstyle
      variantClasses[variant],
      // translatedstyle
      padding ? paddingClasses[padding] : sizeClasses[size],
      // translated
      hoverClasses,
      // translated
      className
    ].filter(Boolean).join(' ')

    return (
      <div
        ref={ref}
        className={combinedClasses}
        {...props}
      >
        {children}
      </div>
    )
  }
)

PCard.displayName = 'PCard'

export default PCard
