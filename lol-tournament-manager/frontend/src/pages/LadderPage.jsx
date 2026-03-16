import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, Users, Gamepad2, TrendingUp, UserPlus, Swords, ChevronDown, ChevronUp, Archive, Zap, Clock, Filter } from 'lucide-react'
import StatCard from '../components/StatCard'
import Badge from '../components/Badge'
import ChampionIcon from '../components/ChampionIcon'
import AddPlayerModal from '../components/AddPlayerModal'
import EmptyState from '../components/EmptyState'
import { useApi } from '../hooks/useApi'
import * as api from '../api/client'

/* ── Activity dot (based on ausencias_consecutivas / is_inactive) ── */
function ActivityIndicator({ player }) {
  const ausencias = player.ausencias_consecutivas || 0
  const inactive = player.is_inactive
  const lastPlayed = player.last_played
  let color, title
  if (!lastPlayed) {
    color = 'text-surface-600'
    title = 'Never played'
  } else if (inactive) {
    color = 'text-red-400'
    title = `Inactive (${ausencias} jornadas missed)`
  } else if (ausencias > 0) {
    color = 'text-yellow-400'
    title = `${ausencias} jornada(s) missed`
  } else {
    color = 'text-emerald-400'
    title = 'Active'
  }
  return (
    <span className={`${color} text-[10px] font-bold`} title={title}>
      {!lastPlayed ? '○' : '●'}
    </span>
  )
}

/* ── Streak badge ── */
function StreakBadge({ player }) {
  const ws = player.win_streak || 0
  const ls = player.loss_streak || 0
  if (ws >= 3) return <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full ml-1" title={`${ws} win streak`}>🔥{ws}W</span>
  if (ls >= 3) return <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full ml-1" title={`${ls} loss streak`}>❄️{ls}L</span>
  return null
}

/* ── Mini sparkline-style Elo chart (SVG) ── */
function EloSparkline({ history }) {
  if (!history || history.length === 0) return <p className="text-xs text-surface-500">No match history yet</p>

  const values = history.map(h => h.elo_after)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const W = 280
  const H = 80
  const padY = 8
  const usableH = H - padY * 2

  const points = values.map((v, i) => {
    const x = values.length === 1 ? W / 2 : (i / (values.length - 1)) * W
    const y = padY + usableH - ((v - min) / range) * usableH
    return { x, y, v }
  })

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${H} L ${points[0].x.toFixed(1)} ${H} Z`

  const lastVal = values[values.length - 1]
  const firstVal = values[0]
  const trending = lastVal >= firstVal

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20" preserveAspectRatio="none">
        <defs>
          <linearGradient id="eloGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={trending ? '#34d399' : '#f87171'} stopOpacity="0.3" />
            <stop offset="100%" stopColor={trending ? '#34d399' : '#f87171'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#eloGrad)" />
        <path d={pathD} fill="none" stroke={trending ? '#34d399' : '#f87171'} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3"
            fill={trending ? '#34d399' : '#f87171'} stroke="#1a1a2e" strokeWidth="1.5"
            className="opacity-0 hover:opacity-100 transition-opacity"
          />
        ))}
      </svg>
      <div className="flex justify-between text-[10px] font-mono mt-1">
        <span className="text-surface-500">Match 1: {Math.round(firstVal)}</span>
        <span className={trending ? 'text-emerald-400' : 'text-red-400'}>
          Latest: {Math.round(lastVal)} ({trending ? '+' : ''}{Math.round(lastVal - firstVal)})
        </span>
      </div>
    </div>
  )
}

/* ── Format "last played" relative time ── */
function formatLastPlayed(dateStr) {
  if (!dateStr) return 'Never'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return 'Never'
    const now = new Date()
    const diffMs = now - d
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
    return d.toLocaleDateString()
  } catch {
    return 'Never'
  }
}


export default function LadderPage() {
  const navigate = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [playerStats, setPlayerStats] = useState({})
  const [sortBy, setSortBy] = useState('elo') // 'elo' or 'power'

  // Season filter
  const [seasons, setSeasons] = useState([])
  const [activeSeason, setActiveSeason] = useState(null)
  const [selectedSeason, setSelectedSeason] = useState('active') // 'all' | 'active' | season id
  const [players, setPlayers] = useState(null)
  const [loading, setLoading] = useState(true)

  const { data: overview } = useApi(() => api.getOverview())

  // Load seasons on mount
  useEffect(() => {
    async function loadSeasons() {
      try {
        const [all, active] = await Promise.all([api.getSeasons(), api.getActiveSeason()])
        setSeasons(all)
        if (active.active) {
          setActiveSeason(active.season)
          setSelectedSeason('active')
        } else {
          setSelectedSeason('all')
        }
      } catch {}
    }
    loadSeasons()
  }, [])

  // Load players when season changes
  useEffect(() => {
    async function loadPlayers() {
      setLoading(true)
      try {
        let seasonId = null
        if (selectedSeason === 'active' && activeSeason) {
          seasonId = activeSeason.id
        } else if (selectedSeason !== 'all' && selectedSeason !== 'active') {
          seasonId = parseInt(selectedSeason)
        }
        const data = await api.getPlayers(true, seasonId)
        setPlayers(data)
      } catch (e) {
        console.error(e)
      }
      setLoading(false)
    }
    loadPlayers()
  }, [selectedSeason, activeSeason])

  const isSeasonView = selectedSeason !== 'all'

  const sortedPlayers = players ? [...players].sort((a, b) => {
    if (isSeasonView) {
      // In season view, sort by season elo diff descending
      return (b.season_elo_diff || 0) - (a.season_elo_diff || 0)
    }
    if (sortBy === 'power') {
      const pa = a.power_ranking ?? a.tournament_elo
      const pb = b.power_ranking ?? b.tournament_elo
      return pb - pa
    }
    return b.tournament_elo - a.tournament_elo
  }) : []

  // In season view, filter out players with 0 games
  const displayPlayers = isSeasonView
    ? sortedPlayers.filter(p => (p.season_games || 0) > 0)
    : sortedPlayers

  const toggleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!playerStats[id]) {
      try {
        const stats = await api.getPlayerStats(id)
        setPlayerStats(prev => ({ ...prev, [id]: stats }))
      } catch {}
    }
  }

  const handleArchive = async (id) => {
    try {
      await api.archivePlayer(id)
      // Reload
      const seasonId = selectedSeason === 'active' && activeSeason ? activeSeason.id
        : selectedSeason !== 'all' ? parseInt(selectedSeason) : null
      setPlayers(await api.getPlayers(true, seasonId))
    } catch {}
  }

  const refetch = async () => {
    const seasonId = selectedSeason === 'active' && activeSeason ? activeSeason.id
      : selectedSeason !== 'all' ? parseInt(selectedSeason) : null
    setPlayers(await api.getPlayers(true, seasonId))
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-surface-400">Loading...</div>
  }

  const seasonLabel = selectedSeason === 'all' ? 'Global'
    : selectedSeason === 'active' && activeSeason ? activeSeason.name
    : seasons.find(s => s.id === parseInt(selectedSeason))?.name || 'Season'

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ladder</h1>
          <p className="text-sm text-surface-400 mt-1">Tournament leaderboard & power rankings</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowAdd(true)} className="btn-ghost border border-surface-600/50 flex items-center gap-2">
            <UserPlus size={16} />
            <span className="hidden sm:inline">Add Player</span>
          </button>
          <button onClick={() => navigate('/match')} className="btn-primary flex items-center gap-2">
            <Swords size={16} />
            New Match
          </button>
        </div>
      </div>

      {/* KPIs */}
      {overview && !isSeasonView && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Active Players" value={overview.total_players} accent="accent" />
          <StatCard icon={Gamepad2} label="Total Matches" value={overview.total_matches} accent="blue" />
          <StatCard icon={TrendingUp} label="Avg Elo" value={Math.round(overview.avg_elo)} accent="gold" />
          <StatCard icon={Trophy} label="Top Rated"
            value={overview.top_player?.name || '-'}
            sub={overview.top_player ? `${Math.round(overview.top_player.tournament_elo)} Elo` : ''}
            accent="gold"
          />
        </div>
      )}

      {/* Season KPIs */}
      {isSeasonView && displayPlayers.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Season Players" value={displayPlayers.length} accent="accent" />
          <StatCard icon={Gamepad2} label="Season Matches"
            value={Math.round(displayPlayers.reduce((s, p) => s + (p.season_games || 0), 0) / 2)} accent="blue" />
          <StatCard icon={TrendingUp} label="Most Improved"
            value={displayPlayers[0]?.name || '-'}
            sub={displayPlayers[0] ? `${displayPlayers[0].season_elo_diff > 0 ? '+' : ''}${Math.round(displayPlayers[0].season_elo_diff)} Elo` : ''}
            accent="gold" />
          <StatCard icon={Trophy} label="Best WR"
            value={(() => {
              const best = [...displayPlayers].filter(p => (p.season_games || 0) >= 3)
                .sort((a, b) => (b.season_wins / b.season_games) - (a.season_wins / a.season_games))[0]
              return best?.name || '-'
            })()}
            sub={(() => {
              const best = [...displayPlayers].filter(p => (p.season_games || 0) >= 3)
                .sort((a, b) => (b.season_wins / b.season_games) - (a.season_wins / a.season_games))[0]
              return best ? `${Math.round(best.season_wins / best.season_games * 100)}%` : ''
            })()}
            accent="gold" />
        </div>
      )}

      {/* Season Filter + Sort */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Season filter */}
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-surface-400" />
          <select
            value={selectedSeason}
            onChange={e => setSelectedSeason(e.target.value)}
            className="bg-surface-800 border border-surface-700/50 rounded-lg px-3 py-1.5 text-sm text-white
                       focus:outline-none focus:border-accent/50 transition-colors"
          >
            <option value="all">Global (All Time)</option>
            {activeSeason && (
              <option value="active">{activeSeason.name} (Active)</option>
            )}
            {seasons.filter(s => s.status === 'finished').map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* Sort toggle (only in global view) */}
        {!isSeasonView && players && players.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-surface-400">Sort by:</span>
            <button
              onClick={() => setSortBy('elo')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                sortBy === 'elo' ? 'bg-accent/20 text-accent' : 'bg-surface-800 text-surface-400 hover:text-white'
              }`}
            >
              Tournament Elo
            </button>
            <button
              onClick={() => setSortBy('power')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                sortBy === 'power' ? 'bg-accent/20 text-accent' : 'bg-surface-800 text-surface-400 hover:text-white'
              }`}
            >
              <Zap size={12} /> Power Ranking
            </button>
          </div>
        )}

        {isSeasonView && (
          <span className="text-xs text-surface-500 ml-auto">
            Sorted by season Elo change · Showing {displayPlayers.length} player(s) with games
          </span>
        )}
      </div>

      {/* Table */}
      {!players || displayPlayers.length === 0 ? (
        <EmptyState
          icon={Users}
          title={isSeasonView ? "No games this season" : "No players yet"}
          description={isSeasonView ? "No matches have been played in this season yet" : "Add your first player to get started"}
          action={
            !isSeasonView && (
              <button onClick={() => setShowAdd(true)} className="btn-primary">
                <UserPlus size={16} className="inline mr-1" /> Add Player
              </button>
            )
          }
        />
      ) : (
        <div className="glass overflow-hidden">
          {/* Header row */}
          {isSeasonView ? (
            <div className="grid grid-cols-[3rem_1fr_5rem_5rem_4.5rem_5rem_4rem_4rem] gap-2 px-5 py-3
                            border-b border-surface-700/40 text-[11px] text-surface-400 font-semibold
                            uppercase tracking-wider">
              <span className="text-center">#</span>
              <span>Player</span>
              <span className="text-right">Elo</span>
              <span className="text-right">+/-</span>
              <span className="text-center">W/L</span>
              <span className="text-center">WR</span>
              <span className="text-center">MVP</span>
              <span className="text-center">ACE</span>
            </div>
          ) : (
            <div className="grid grid-cols-[3rem_1fr_5rem_5rem_4.5rem_5rem_4rem_4rem] gap-2 px-5 py-3
                            border-b border-surface-700/40 text-[11px] text-surface-400 font-semibold
                            uppercase tracking-wider">
              <span className="text-center">#</span>
              <span>Player</span>
              <span className="text-right">{sortBy === 'power' ? 'Power' : 'Elo'}</span>
              <span className="text-right">{sortBy === 'power' ? 'Elo' : 'Power'}</span>
              <span className="text-center">W/L</span>
              <span className="text-center">WR</span>
              <span className="text-center">MVP</span>
              <span className="text-center">ACE</span>
            </div>
          )}

          {/* Player rows */}
          {displayPlayers.map((p, i) => {
            const isExpanded = expandedId === p.id
            const stats = playerStats[p.id]
            const power = p.power_ranking ?? p.tournament_elo

            // Season or global stats
            const wins = isSeasonView ? (p.season_wins || 0) : p.wins
            const losses = isSeasonView ? (p.season_losses || 0) : p.losses
            const games = isSeasonView ? (p.season_games || 0) : p.games_played
            const mvps = isSeasonView ? (p.season_mvps || 0) : p.mvp_count
            const aces = isSeasonView ? (p.season_aces || 0) : p.ace_count
            const wr = games > 0 ? `${Math.round(wins / games * 100)}%` : '-'

            return (
              <div key={p.id} className="border-b border-surface-700/20 last:border-0">
                <div
                  onClick={() => toggleExpand(p.id)}
                  className="grid grid-cols-[3rem_1fr_5rem_5rem_4.5rem_5rem_4rem_4rem] gap-2 px-5 py-3
                             hover:bg-surface-800/50 cursor-pointer transition-colors items-center"
                >
                  {/* Rank */}
                  <span className="text-center text-sm font-bold text-surface-400">
                    {i === 0 ? '👑' : i + 1}
                  </span>

                  {/* Player */}
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent/30 to-surface-700
                                    flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {p.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                        <ActivityIndicator player={p} />
                        <StreakBadge player={p} />
                      </div>
                      <p className="text-[11px] text-surface-500 truncate">
                        {p.lol_name_tag}
                        {p.last_played && (
                          <span className="ml-1.5 text-surface-600">
                            · {formatLastPlayed(p.last_played)}
                          </span>
                        )}
                      </p>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-surface-500 shrink-0" /> :
                                  <ChevronDown size={14} className="text-surface-500 shrink-0" />}
                  </div>

                  {/* Elo / Season columns */}
                  {isSeasonView ? (
                    <>
                      <span className="text-right text-sm font-mono font-semibold text-white">
                        {Math.round(p.tournament_elo)}
                      </span>
                      <span className={`text-right text-sm font-mono font-semibold ${
                        (p.season_elo_diff || 0) > 0 ? 'text-emerald-400' :
                        (p.season_elo_diff || 0) < 0 ? 'text-red-400' : 'text-surface-400'
                      }`}>
                        {(p.season_elo_diff || 0) > 0 ? '+' : ''}{Math.round(p.season_elo_diff || 0)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-right text-sm font-mono font-semibold text-white">
                        {Math.round(p.tournament_elo)}
                      </span>
                      <span className="text-right text-sm font-mono text-surface-400">
                        {Math.round(power)}
                      </span>
                    </>
                  )}

                  {/* W/L */}
                  <span className="text-center text-xs font-mono text-surface-300">
                    {wins}/{losses}
                  </span>

                  {/* Win Rate */}
                  <span className={`text-center text-sm font-semibold
                    ${games === 0 ? 'text-surface-500' :
                      wins / games >= 0.6 ? 'text-emerald-400' :
                      wins / games <= 0.4 ? 'text-red-400' : 'text-surface-200'}`}>
                    {wr}
                  </span>

                  {/* MVP */}
                  <div className="flex justify-center">
                    {mvps > 0 ? <Badge variant="mvp" count={mvps} /> : <span className="text-surface-600 text-xs">-</span>}
                  </div>

                  {/* ACE */}
                  <div className="flex justify-center">
                    {aces > 0 ? <Badge variant="ace" count={aces} /> : <span className="text-surface-600 text-xs">-</span>}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && stats && (
                  <div className="px-5 pb-4 bg-surface-800/30 animate-slide-up">
                    {/* Elo + Info cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 pt-2">
                      <div className="bg-surface-800/50 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-surface-500 uppercase tracking-wider">Tournament Elo</p>
                        <p className="text-lg font-mono font-bold text-white">{Math.round(stats.player.tournament_elo)}</p>
                      </div>
                      <div className="bg-surface-800/50 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-surface-500 uppercase tracking-wider">Streak</p>
                        <p className="text-lg font-mono font-bold text-surface-300">
                          {(stats.player.win_streak || 0) > 0 ? `🔥 ${stats.player.win_streak}W` :
                           (stats.player.loss_streak || 0) > 0 ? `❄️ ${stats.player.loss_streak}L` : '—'}
                        </p>
                      </div>
                      {isSeasonView && (
                        <div className="bg-surface-800/50 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-surface-500 uppercase tracking-wider">Season Change</p>
                          <p className={`text-lg font-mono font-bold ${
                            (p.season_elo_diff || 0) > 0 ? 'text-emerald-400' :
                            (p.season_elo_diff || 0) < 0 ? 'text-red-400' : 'text-surface-300'
                          }`}>
                            {(p.season_elo_diff || 0) > 0 ? '+' : ''}{Math.round(p.season_elo_diff || 0)}
                          </p>
                        </div>
                      )}
                      {!isSeasonView && (
                        <div className="bg-surface-800/50 rounded-lg px-3 py-2">
                          <p className="text-[10px] text-surface-500 uppercase tracking-wider">Power Ranking</p>
                          <p className="text-lg font-mono font-bold text-accent">{Math.round(stats.power_ranking)}</p>
                        </div>
                      )}
                      <div className="bg-surface-800/50 rounded-lg px-3 py-2">
                        <p className="text-[10px] text-surface-500 uppercase tracking-wider flex items-center gap-1">
                          <Clock size={10} /> Last Played
                        </p>
                        <p className="text-sm font-mono text-surface-300">
                          {formatLastPlayed(stats.player.last_played)}
                        </p>
                        {stats.player.last_played && (
                          <p className="text-[10px] text-surface-500">
                            {new Date(stats.player.last_played).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Champion stats */}
                      <div>
                        <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
                          Signature Champions
                        </h4>
                        {stats.champion_stats.length === 0 ? (
                          <p className="text-xs text-surface-500">No champion data yet</p>
                        ) : (
                          <div className="space-y-1">
                            {stats.champion_stats.slice(0, 5).map(cs => {
                              const cwr = (cs.wins + cs.losses) > 0
                                ? Math.round(cs.wins / (cs.wins + cs.losses) * 100) : 0
                              return (
                                <div key={cs.champion} className="flex items-center gap-3 text-sm">
                                  <ChampionIcon name={cs.champion} size={20} />
                                  <span className="text-white font-medium w-24 truncate">{cs.champion}</span>
                                  <span className="text-surface-400 text-xs w-16">{cs.picks} games</span>
                                  <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${cwr >= 60 ? 'bg-emerald-400' : cwr <= 40 ? 'bg-red-400' : 'bg-surface-400'}`}
                                      style={{ width: `${cwr}%` }}
                                    />
                                  </div>
                                  <span className="text-xs font-mono w-10 text-right text-surface-300">{cwr}%</span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Elo Progression (SVG sparkline) */}
                      <div>
                        <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
                          Elo Progression
                        </h4>
                        <EloSparkline history={stats.elo_history} />
                      </div>
                    </div>

                    {/* Archive button */}
                    <div className="mt-3 pt-3 border-t border-surface-700/30 flex justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleArchive(p.id) }}
                        className="text-xs text-surface-500 hover:text-red-400 flex items-center gap-1 transition-colors"
                      >
                        <Archive size={12} /> Archive Player
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <AddPlayerModal open={showAdd} onClose={() => setShowAdd(false)} onAdded={() => refetch()} />
    </div>
  )
}
