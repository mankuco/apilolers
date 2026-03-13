import ChampionSelect from './ChampionSelect'
import Badge from './Badge'
import EloChange from './EloChange'

/**
 * Displays a 5-player team panel (Blue or Red).
 *
 * @param {"blue"|"red"} side
 * @param {Object[]}     players   — player objects
 * @param {string[]}     picks     — champion picks (editable)
 * @param {string[]}     bans      — champion bans  (editable)
 * @param {Function}     onPickChange(index, value)
 * @param {Function}     onBanChange(index, value)
 * @param {string[]}     champions — full champion list
 * @param {number}       avgElo
 * @param {boolean}      [readonly]
 * @param {Object}       [eloChanges] — {playerId: delta} for history view
 * @param {number}       [mvpId]
 * @param {number}       [aceId]
 */
export default function TeamPanel({
  side, players = [], picks = [], bans = [],
  onPickChange, onBanChange, champions = [],
  avgElo, readonly = false, eloChanges, mvpId, aceId,
}) {
  const isBlue = side === 'blue'
  const borderColor = isBlue ? 'border-blue-team/40' : 'border-red-team/40'
  const glowClass = isBlue ? 'glow-blue' : 'glow-red'
  const sideLabel = isBlue ? 'Blue Team' : 'Red Team'
  const bgGradient = isBlue
    ? 'bg-gradient-to-b from-blue-team/10 to-transparent'
    : 'bg-gradient-to-b from-red-team/10 to-transparent'

  return (
    <div className={`glass-sm ${borderColor} ${glowClass} overflow-hidden`}>
      {/* Header */}
      <div className={`px-5 py-3 border-b ${borderColor} ${bgGradient}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${isBlue ? 'bg-blue-glow' : 'bg-red-glow'}`} />
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">{sideLabel}</h3>
          </div>
          {avgElo != null && (
            <span className="text-xs font-mono text-surface-300">
              Avg {Math.round(avgElo)}
            </span>
          )}
        </div>
      </div>

      {/* Players */}
      <div className="divide-y divide-surface-700/30">
        {players.map((p, i) => (
          <div key={p.id} className="px-5 py-3 flex items-center gap-3">
            {/* Rank number */}
            <span className="w-5 text-xs font-mono text-surface-500 text-right shrink-0">
              {i + 1}
            </span>

            {/* Player info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white truncate">{p.name}</span>
                <span className="text-[11px] font-mono text-surface-400">
                  {Math.round(p.tournament_elo)}
                </span>
                {mvpId === p.id && <Badge variant="mvp" />}
                {aceId === p.id && <Badge variant="ace" />}
              </div>
              <p className="text-[11px] text-surface-500 truncate">{p.lol_name_tag}</p>
            </div>

            {/* Champion pick */}
            <div className="w-40 shrink-0">
              {readonly ? (
                <span className="text-sm text-surface-200">{picks[i] || '—'}</span>
              ) : (
                <ChampionSelect
                  champions={champions}
                  value={picks[i] || ''}
                  onChange={(v) => onPickChange?.(i, v)}
                />
              )}
            </div>

            {/* Elo change (history view) */}
            {eloChanges && eloChanges[String(p.id)] != null && (
              <div className="w-16 text-right shrink-0">
                <EloChange delta={eloChanges[String(p.id)]} size="sm" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bans */}
      {(bans.some(b => b) || !readonly) && (
        <div className={`px-5 py-3 border-t ${borderColor} ${bgGradient}`}>
          <p className="text-[10px] uppercase tracking-widest text-surface-500 mb-2">Bans</p>
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-[calc(20%-6px)]">
                {readonly ? (
                  <span className="text-xs text-surface-300 bg-surface-800 rounded-lg px-2 py-1 block text-center truncate">
                    {bans[i] || '—'}
                  </span>
                ) : (
                  <ChampionSelect
                    champions={champions}
                    value={bans[i] || ''}
                    onChange={(v) => onBanChange?.(i, v)}
                    placeholder={`Ban ${i + 1}`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
