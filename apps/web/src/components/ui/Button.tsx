'use client'

import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import type { ComponentPropsWithoutRef, MouseEvent } from 'react'
import { getAudioManager } from '@/lib/audio'

type Variant = 'primary' | 'warrior' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: Variant
  size?: Size
  classColor?: string
  loading?: boolean
  angled?: boolean
}

const sizeStyles: Record<Size, string> = {
  sm: 'text-[11px] py-2.5 px-5 tracking-[0.2em]',
  md: 'text-[13px] py-3.5 px-8 tracking-[0.22em]',
  lg: 'text-[15px] py-4 px-10 tracking-[0.24em]',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'primary', size = 'md', classColor, loading, angled = true, children, disabled, className = '', style, ...props },
    ref
  ) {
    const isDisabled = disabled || loading
    const clip = angled ? 'polygon(12px 0%, 100% 0%, calc(100% - 12px) 100%, 0% 100%)' : undefined

    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      if (!isDisabled) {
        const mgr = getAudioManager()
        if (variant === 'primary' || variant === 'warrior') mgr.playButtonConfirm()
        else mgr.playButtonTap()
      }
      props.onClick?.(e)
    }

    const variantStyles: Record<Variant, React.CSSProperties> = {
      primary: {
        background: 'linear-gradient(135deg, #fefce8 0%, #fde047 20%, #eab308 55%, #ca8a04 80%, #92400e 100%)',
        color: '#080610',
        boxShadow: '0 0 36px rgba(234,179,8,0.45), 0 6px 24px rgba(0,0,0,0.9)',
      },
      warrior: {
        background: classColor
          ? `linear-gradient(135deg, ${classColor}ee, ${classColor})`
          : 'linear-gradient(135deg, #fde047, #eab308)',
        color: '#080610',
        boxShadow: classColor
          ? `0 0 36px ${classColor}55, 0 6px 24px rgba(0,0,0,0.9)`
          : '0 0 36px rgba(234,179,8,0.45), 0 6px 24px rgba(0,0,0,0.9)',
      },
      secondary: {
        background: 'rgba(18,18,26,0.9)',
        color: 'rgba(226,232,240,0.85)',
        border: '1px solid rgba(42,42,58,0.9)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      },
      ghost: {
        background: 'transparent',
        color: 'rgba(226,232,240,0.6)',
        border: '1px solid rgba(255,255,255,0.08)',
      },
      danger: {
        background: 'linear-gradient(135deg, #dc2626, #991b1b)',
        color: '#fff',
        boxShadow: '0 0 24px rgba(220,38,38,0.4), 0 4px 16px rgba(0,0,0,0.8)',
      },
    }

    return (
      <motion.button
        ref={ref as React.Ref<HTMLButtonElement>}
        whileHover={isDisabled ? undefined : { scale: 1.02, filter: 'brightness(1.1)' }}
        whileTap={isDisabled ? undefined : { scale: 0.97 }}
        disabled={isDisabled}
        className={`relative overflow-hidden font-display font-black uppercase leading-none transition-opacity ${sizeStyles[size]} ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
        style={{
          clipPath: clip,
          ...variantStyles[variant],
          ...style,
        }}
        onClick={handleClick}
        {...(props as ComponentPropsWithoutRef<typeof motion.button>)}
      >
        {(variant === 'primary' || variant === 'warrior') && (
          <motion.span
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(108deg, transparent 28%, rgba(255,255,255,0.22) 50%, transparent 72%)' }}
            animate={{ x: ['-140%', '220%'] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'linear', repeatDelay: 3 }}
          />
        )}
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <motion.span
              className="w-3 h-3 rounded-full border-2 border-current border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
            />
            {children}
          </span>
        ) : children}
      </motion.button>
    )
  }
)
