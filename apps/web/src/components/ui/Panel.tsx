import type { ReactNode, CSSProperties } from 'react'
import { motion } from 'framer-motion'

type Variant = 'default' | 'gold' | 'elevated' | 'glass' | 'battle' | 'class'

interface PanelProps {
  children: ReactNode
  variant?: Variant
  classColor?: string
  animate?: boolean
  className?: string
  style?: CSSProperties
}

const variantBase: Record<Variant, string> = {
  default:  'bg-hunt-surface border border-hunt-border rounded-2xl',
  gold:     'bg-[rgba(18,18,26,0.9)] border-l-[3px] border-y border-r border-hunt-gold/60 border-y-hunt-border/50 border-r-hunt-border/50 rounded-2xl',
  elevated: 'bg-hunt-surface-2 border border-hunt-border rounded-2xl',
  glass:    'glass rounded-2xl',
  battle:   'bg-[rgba(6,5,16,0.95)] border border-white/[0.06] rounded-2xl',
  class:    'rounded-2xl border',
}

export function Panel({ children, variant = 'default', classColor, animate = false, className = '', style }: PanelProps) {
  const base = variantBase[variant]

  const classVariantStyle: CSSProperties = variant === 'class' && classColor ? {
    background: `${classColor}08`,
    borderColor: `${classColor}25`,
    boxShadow: `0 0 24px ${classColor}10, 0 8px 32px rgba(0,0,0,0.8)`,
  } : {}

  const elevatedStyle: CSSProperties = variant === 'elevated' ? {
    boxShadow: '0 8px 32px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.4)',
  } : {}

  const content = (
    <div
      className={`${base} ${className}`}
      style={{ ...classVariantStyle, ...elevatedStyle, ...style }}
    >
      {children}
    </div>
  )

  if (!animate) return content

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {content}
    </motion.div>
  )
}
