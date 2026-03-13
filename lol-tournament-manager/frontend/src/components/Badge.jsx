import { Award, Shield } from 'lucide-react'

const VARIANTS = {
  mvp: {
    icon: Award,
    label: 'MVP',
    classes: 'bg-gold/15 text-gold border-gold/30',
  },
  ace: {
    icon: Shield,
    label: 'ACE',
    classes: 'bg-blue-glow/15 text-blue-glow border-blue-glow/30',
  },
}

/**
 * Badge component — displays MVP or ACE tag.
 * @param {"mvp"|"ace"} variant
 * @param {number} [count] — optional count to show
 * @param {"sm"|"md"} [size]
 */
export default function Badge({ variant, count, size = 'sm' }) {
  const v = VARIANTS[variant]
  if (!v) return null
  const Icon = v.icon

  const sizeClasses = size === 'md'
    ? 'px-2.5 py-1 text-xs gap-1.5'
    : 'px-2 py-0.5 text-[11px] gap-1'

  return (
    <span className={`inline-flex items-center font-semibold rounded-lg border
                      ${v.classes} ${sizeClasses}`}>
      <Icon size={size === 'md' ? 14 : 12} />
      {v.label}
      {count != null && count > 0 && (
        <span className="opacity-70">x{count}</span>
      )}
    </span>
  )
}
