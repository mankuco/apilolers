import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

/**
 * Displays a colored Elo delta: +16.1 (green) or -8.0 (red).
 * @param {number} delta
 * @param {boolean} [showIcon]
 * @param {"sm"|"md"|"lg"} [size]
 */
export default function EloChange({ delta, showIcon = true, size = 'md' }) {
  if (delta == null) return null

  const positive = delta > 0
  const neutral = delta === 0

  const color = neutral ? 'text-surface-400' : positive ? 'text-emerald-400' : 'text-red-400'
  const Icon = neutral ? Minus : positive ? TrendingUp : TrendingDown

  const sizeClasses = {
    sm: 'text-xs gap-0.5',
    md: 'text-sm gap-1',
    lg: 'text-base gap-1 font-semibold',
  }[size]

  const sign = positive ? '+' : ''

  return (
    <span className={`inline-flex items-center font-mono ${color} ${sizeClasses}`}>
      {showIcon && <Icon size={size === 'sm' ? 12 : size === 'lg' ? 18 : 14} />}
      {sign}{delta.toFixed(1)}
    </span>
  )
}
