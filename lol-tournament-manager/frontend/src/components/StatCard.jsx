/**
 * Metric card — shows a label and large value with optional sub-text.
 */
export default function StatCard({ label, value, sub, icon: Icon, accent }) {
  const accentColor = accent === 'gold' ? 'text-gold' :
                      accent === 'blue' ? 'text-blue-glow' :
                      accent === 'red' ? 'text-red-glow' :
                      accent === 'accent' ? 'text-accent' : 'text-white'

  return (
    <div className="glass-sm p-5 flex flex-col gap-1 animate-fade-in">
      <div className="flex items-center gap-2 text-surface-400">
        {Icon && <Icon size={16} />}
        <span className="text-xs font-medium uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${accentColor}`}>{value}</p>
      {sub && <p className="text-xs text-surface-400">{sub}</p>}
    </div>
  )
}
