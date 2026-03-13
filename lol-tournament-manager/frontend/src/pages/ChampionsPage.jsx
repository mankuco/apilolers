import { useState, useMemo } from 'react'
import { Gamepad2, ArrowUpDown, Filter } from 'lucide-react'
import ChampionIcon from '../components/ChampionIcon'
import EmptyState from '../components/EmptyState'
import { useApi } from '../hooks/useApi'
import * as api from '../api/client'

export default function ChampionsPage() {
  const { data: globalStats, loading: gLoading } = useApi(() => api.getChampionStats())
  const { data: players } = useApi(() => api.getPlayers(false))

  const [sortKey, setSortKey] = useState('total_picks')
  const [sortDir, setSortDir] = useState('desc')
  const [filterPlayer, setFilterPlayer] = useState(null) // null = global, else player_id
  const [playerChampStats, setPlayerChampStats] = useState(null)
  const [loadingPlayer, setLoadingPlayer] = useState(false)

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const handleFilterPlayer = async (pid) => {
    if (!pid) {
      setFilterPlayer(null)
      setPlayerChampStats(null)
      return
    }
    setFilterPlayer(pid)
    setLoadingPlayer(true)
    try {
      const stats = await api.getPlayerStats(pid)
      setPlayerChampStats(stats.champion_stats)
    } catch {
      setPlayerChampStats([])
    } finally {
      setLoadingPlayer(false)
    }
  }

  // Current data source
  const rawData = filterPlayer ? playerChampStats : globalStats
  const isGlobal = !filterPlayer

  // Compute totals + sort
  const data = useMemo(() => {
    if (!rawData || rawData.length === 0) return []

    const totalPicks = rawData.reduce((s, r) => s + (r.total_picks || r.picks || 0), 0) || 1
    const totalBans = rawData.reduce((s, r) => s + (r.total_bans || r.bans || 0), 0) || 1

    const enriched = rawData.map(r => {
      const picks = r.total_picks ?? r.picks ?? 0
      const bans = r.total_bans ?? r.bans ?? 0
      const wins = r.total_wins ?? r.wins ?? 0
      const losses = r.total_losses ?? r.losses ?? 0
      const games = wins + losses
      return {
        champion: r.champion,
        picks,
        bans,
        wins,
        losses,
        pick_rate: +(picks / totalPicks * 100).toFixed(1),
        ban_rate: +(bans / totalBans * 100).toFixed(1),
        win_rate: games > 0 ? +(wins / games * 100).toFixed(1) : 0,
        games,
      }
    })

    const sorted = [...enriched].sort((a, b) => {
      const va = a[sortKey] ?? 0
      const vb = b[sortKey] ?? 0
      return sortDir === 'asc' ? va - vb : vb - va
    })

    return sorted
  }, [rawData, sortKey, sortDir])

  const SortHeader = ({ label, field, className = '' }) => {
    const active = sortKey === field
    return (
      <button
        onClick={() => handleSort(field)}
        className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors
          ${active ? 'text-accent' : 'text-surface-400 hover:text-surface-200'} ${className}`}
      >
        {label}
        <ArrowUpDown size={10} className={active ? 'text-accent' : 'text-surface-600'} />
      </button>
    )
  }

  if (gLoading) return <div className="text-surface-400 text-center py-16">Loading...</div>

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Champions</h1>
          <p className="text-sm text-surface-400 mt-1">Pick rates, ban rates & win rates</p>
        </div>

        {/* Player filter */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-surface-400" />
          <select
            value={filterPlayer || ''}
            onChange={(e) => handleFilterPlayer(e.target.value ? Number(e.target.value) : null)}
            className="select-field w-56 text-sm"
          >
            <option value="">All Players (Global)</option>
            {players?.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.lol_name_tag})</option>
            ))}
          </select>
        </div>
      </div>

      {loadingPlayer ? (
        <div className="text-surface-400 text-center py-16">Loading player stats...</div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={Gamepad2}
          title="No champion data"
          description={filterPlayer ? "This player hasn't played any matches yet" : "Play some matches to see champion statistics"}
        />
      ) : (
        <>
          {/* Top champions bar chart */}
          <div className="glass p-5">
            <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-4">
              Top Champions by Pick Rate
            </h2>
            <div className="space-y-2">
              {data.slice(0, 10).map(c => (
                <div key={c.champion} className="flex items-center gap-3">
                  <ChampionIcon name={c.champion} size={24} />
                  <span className="text-sm text-white w-24 truncate shrink-0">{c.champion}</span>
                  <div className="flex-1 h-5 bg-surface-800 rounded-full overflow-hidden">
                    <div className="h-full flex">
                      <div
                        className="bg-accent/60 h-full"
                        style={{ width: `${Math.min(c.pick_rate * 3, 100)}%` }}
                        title={`Pick: ${c.pick_rate}%`}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-mono text-surface-300 w-12 text-right">{c.pick_rate}%</span>
                  <span className={`text-xs font-mono w-12 text-right font-semibold
                    ${c.win_rate >= 55 ? 'text-emerald-400' : c.win_rate <= 45 ? 'text-red-400' : 'text-surface-300'}`}>
                    {c.win_rate}% WR
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Full table */}
          <div className="glass overflow-hidden">
            <div className="grid grid-cols-[1fr_5rem_5rem_5rem_5rem_5rem_5rem_5rem] gap-2 px-5 py-3
                            border-b border-surface-700/40">
              <SortHeader label="Champion" field="champion" />
              <SortHeader label="Picks" field="picks" className="justify-end" />
              <SortHeader label="Pick %" field="pick_rate" className="justify-end" />
              <SortHeader label="Bans" field="bans" className="justify-end" />
              <SortHeader label="Ban %" field="ban_rate" className="justify-end" />
              <SortHeader label="Wins" field="wins" className="justify-end" />
              <SortHeader label="Losses" field="losses" className="justify-end" />
              <SortHeader label="WR %" field="win_rate" className="justify-end" />
            </div>

            {data.map(c => (
              <div key={c.champion}
                className="grid grid-cols-[1fr_5rem_5rem_5rem_5rem_5rem_5rem_5rem] gap-2 px-5 py-2.5
                           border-b border-surface-700/20 last:border-0 hover:bg-surface-800/30 transition-colors items-center">
                <span className="flex items-center gap-2 text-sm font-semibold text-white truncate">
                  <ChampionIcon name={c.champion} size={22} />
                  {c.champion}
                </span>
                <span className="text-right text-sm font-mono text-surface-200">{c.picks}</span>
                <span className="text-right text-sm font-mono text-surface-400">{c.pick_rate}%</span>
                <span className="text-right text-sm font-mono text-surface-200">{c.bans}</span>
                <span className="text-right text-sm font-mono text-surface-400">{c.ban_rate}%</span>
                <span className="text-right text-sm font-mono text-emerald-400">{c.wins}</span>
                <span className="text-right text-sm font-mono text-red-400">{c.losses}</span>
                <span className={`text-right text-sm font-mono font-semibold
                  ${c.win_rate >= 55 ? 'text-emerald-400' : c.win_rate <= 45 ? 'text-red-400' : 'text-surface-200'}`}>
                  {c.win_rate}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
