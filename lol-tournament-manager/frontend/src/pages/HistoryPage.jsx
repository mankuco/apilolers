import { useState, useEffect, useMemo } from 'react'
import { ScrollText, ChevronDown, ChevronUp, Clock, Archive, RotateCcw, AlertTriangle, Loader2, Plus, X, Award, Shield, Calendar } from 'lucide-react'
import Badge from '../components/Badge'
import EloChange from '../components/EloChange'
import ChampionIcon from '../components/ChampionIcon'
import ChampionSelect from '../components/ChampionSelect'
import EmptyState from '../components/EmptyState'
import { useApi } from '../hooks/useApi'
import * as api from '../api/client'

/* ── Elo v2 breakdown tags ── */
function EloBreakdown({ data }) {
  if (!data || typeof data !== 'object' || data.delta === undefined) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-300 font-mono">
        B:{data.delta_base > 0 ? '+' : ''}{data.delta_base?.toFixed(1)}
      </span>
      {data.performance_mod !== 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
          data.performance_mod > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          P:{data.performance_mod > 0 ? '+' : ''}{data.performance_mod?.toFixed(1)}
        </span>
      )}
      {data.activity_bonus !== 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
          data.activity_bonus > 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'
        }`}>
          A:{data.activity_bonus > 0 ? '+' : ''}{data.activity_bonus?.toFixed(0)}
        </span>
      )}
      {data.award_bonus !== 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold font-mono">
          +{data.award_bonus?.toFixed(0)}
        </span>
      )}
    </div>
  )
}

/* ── Confirm dialog inline ── */
function ConfirmAction({ message, onConfirm, onCancel, loading }) {
  return (
    <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mt-2 animate-fade-in">
      <AlertTriangle size={16} className="text-yellow-400 shrink-0" />
      <p className="text-xs text-yellow-200 flex-1">{message}</p>
      <button onClick={onCancel}
        className="text-xs text-surface-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-surface-700/50 transition-colors">
        Cancelar
      </button>
      <button onClick={onConfirm} disabled={loading}
        className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-40">
        {loading && <Loader2 size={12} className="animate-spin" />}
        Confirmar
      </button>
    </div>
  )
}

/* ── Single match card ── */
function MatchCard({ m, players, isExpanded, onToggle, actions }) {
  const winnerSide = m.winner
  const winLabel = winnerSide === 'Blue' ? '🔵 Blue' : '🔴 Red'
  const hasPerfs = m.performances && m.performances.length > 0
  const perfMap = {}
  if (hasPerfs) {
    m.performances.forEach(p => { perfMap[p.player_id] = p })
  }

  const getDelta = (pid) => {
    const ec = m.elo_changes?.[String(pid)]
    if (ec == null) return null
    if (typeof ec === 'object') return ec.delta
    return ec
  }
  const getEloData = (pid) => {
    const ec = m.elo_changes?.[String(pid)]
    if (ec != null && typeof ec === 'object') return ec
    return null
  }

  const renderTeam = (teamIds, picks, teamColor, teamLabel, avgElo) => (
    <div className="p-5 space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-3 h-3 rounded-full ${teamColor === 'blue' ? 'bg-blue-glow' : 'bg-red-glow'}`} />
        <h3 className={`text-sm font-bold uppercase tracking-wider ${teamColor === 'blue' ? 'text-blue-glow' : 'text-red-glow'}`}>
          {teamLabel}
        </h3>
        <span className="text-xs font-mono text-surface-400 ml-auto">Avg {Math.round(avgElo)}</span>
      </div>
      {teamIds.map((pid, i) => {
        const p = players[pid]
        const champ = picks?.[i] || ''
        const delta = getDelta(pid)
        const eloData = getEloData(pid)
        const perf = perfMap[pid]
        return (
          <div key={pid} className="py-1.5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-white w-24 truncate">{p?.name || `#${pid}`}</span>
              {champ ? (
                <span className="flex items-center gap-1.5 w-28">
                  <ChampionIcon name={champ} size={20} />
                  <span className="text-xs text-surface-300 truncate">{champ}</span>
                </span>
              ) : (
                <span className="text-xs text-surface-500 w-28">-</span>
              )}
              {perf && (
                <span className="text-[10px] font-mono text-surface-400">
                  {perf.kills}/{perf.deaths}/{perf.assists}
                </span>
              )}
              <div className="flex items-center gap-2 ml-auto">
                {pid === m.mvp_player_id && <Badge variant="mvp" />}
                {pid === m.ace_player_id && <Badge variant="ace" />}
                {delta != null && <EloChange delta={delta} size="sm" />}
              </div>
            </div>
            <EloBreakdown data={eloData} />
          </div>
        )
      })}
      <div className="pt-2 border-t border-surface-700/30">
        <span className="text-[10px] text-surface-500 uppercase tracking-widest">Bans: </span>
        <span className="text-xs text-surface-300">
          {(teamColor === 'blue' ? m.bans_blue : m.bans_red)?.filter(Boolean).join(', ') || 'None'}
        </span>
      </div>
    </div>
  )

  return (
    <div className={`glass overflow-hidden animate-fade-in ${m.archived ? 'opacity-70' : ''}`}>
      <button onClick={onToggle}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-surface-800/30 transition-colors">
        <span className="text-xs font-mono text-surface-500 w-12 shrink-0">#{m.id}</span>
        <span className="text-xs text-surface-400 w-24 shrink-0">{m.timestamp?.slice(0, 10)}</span>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${winnerSide === 'Blue' ? 'bg-blue-glow' : 'bg-surface-500'}`} />
            <span className={`text-sm font-semibold ${winnerSide === 'Blue' ? 'text-blue-glow' : 'text-surface-300'}`}>
              Blue ({Math.round(m.avg_blue_elo)})
            </span>
          </div>
          <span className="text-surface-600 text-xs">vs</span>
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${winnerSide === 'Red' ? 'bg-red-glow' : 'bg-surface-500'}`} />
            <span className={`text-sm font-semibold ${winnerSide === 'Red' ? 'text-red-glow' : 'text-surface-300'}`}>
              Red ({Math.round(m.avg_red_elo)})
            </span>
          </div>
        </div>
        {m.duration_seconds > 0 && (
          <span className="text-[10px] text-surface-500 font-mono flex items-center gap-1">
            <Clock size={10} />{Math.floor(m.duration_seconds / 60)}m
          </span>
        )}
        {m.tournament_code && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent font-mono">TC</span>
        )}
        {m.archived ? (
          <span className="text-[10px] px-2 py-1 rounded-lg bg-yellow-500/15 text-yellow-400 font-semibold">Archivada</span>
        ) : (
          <span className={`text-xs font-bold px-2 py-1 rounded-lg
            ${winnerSide === 'Blue' ? 'bg-blue-team/20 text-blue-glow' : 'bg-red-team/20 text-red-glow'}`}>
            {winLabel} Wins
          </span>
        )}
        {isExpanded ? <ChevronUp size={16} className="text-surface-500" /> :
                      <ChevronDown size={16} className="text-surface-500" />}
      </button>

      {isExpanded && (
        <div className="border-t border-surface-700/40 animate-slide-up">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:divide-x divide-surface-700/30">
            {renderTeam(m.team_blue, m.picks_blue, 'blue', 'Blue Team', m.avg_blue_elo)}
            {renderTeam(m.team_red, m.picks_red, 'red', 'Red Team', m.avg_red_elo)}
          </div>

          {hasPerfs && (
            <div className="border-t border-surface-700/40 p-5">
              <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">
                Performance Breakdown (match-v5)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-surface-500 border-b border-surface-700/30">
                      <th className="text-left py-1 pr-3">Player</th>
                      <th className="text-left py-1 pr-3">Champion</th>
                      <th className="text-center py-1 px-2">KDA</th>
                      <th className="text-right py-1 px-2">Damage</th>
                      <th className="text-right py-1 px-2">Vision</th>
                      <th className="text-right py-1 px-2">CS</th>
                      <th className="text-right py-1 px-2">Gold</th>
                      <th className="text-center py-1 px-2">KP</th>
                      <th className="text-center py-1 px-2">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.performances.map(perf => {
                      const p = players[perf.player_id]
                      return (
                        <tr key={perf.player_id} className="border-b border-surface-700/20 last:border-0">
                          <td className="py-1.5 pr-3 font-semibold text-white">{p?.name || `#${perf.player_id}`}</td>
                          <td className="py-1.5 pr-3 text-surface-300">
                            <span className="flex items-center gap-1.5">
                              {perf.champion && <ChampionIcon name={perf.champion} size={18} />}
                              {perf.champion || '-'}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono text-surface-200">
                            {perf.kills}/{perf.deaths}/{perf.assists}
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-surface-300">
                            {(perf.total_damage_to_champions / 1000).toFixed(1)}k
                          </td>
                          <td className="py-1.5 px-2 text-right font-mono text-surface-300">{perf.vision_score}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-surface-300">{perf.cs}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-surface-300">
                            {(perf.gold_earned / 1000).toFixed(1)}k
                          </td>
                          <td className="py-1.5 px-2 text-center font-mono text-surface-300">
                            {(perf.kill_participation * 100).toFixed(0)}%
                          </td>
                          <td className={`py-1.5 px-2 text-center font-mono font-bold ${
                            perf.performance_score > 0 ? 'text-emerald-400' :
                            perf.performance_score < 0 ? 'text-red-400' : 'text-surface-300'
                          }`}>
                            {perf.performance_score > 0 ? '+' : ''}{perf.performance_score?.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {actions}
        </div>
      )}
    </div>
  )
}


/* ── Add Past Match Form ── */
function AddPastMatchForm({ allPlayers, champions, onCreated, onCancel }) {
  const [teamBlue, setTeamBlue] = useState([null, null, null, null, null])
  const [teamRed, setTeamRed] = useState([null, null, null, null, null])
  const [picksBlue, setPicksBlue] = useState(['', '', '', '', ''])
  const [picksRed, setPicksRed] = useState(['', '', '', '', ''])
  const [bansBlue, setBansBlue] = useState(['', '', '', '', ''])
  const [bansRed, setBansRed] = useState(['', '', '', '', ''])
  const [winner, setWinner] = useState(null)
  const [mvpId, setMvpId] = useState(null)
  const [aceId, setAceId] = useState(null)
  const [matchDate, setMatchDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // All selected player IDs (to prevent duplicates)
  const selectedIds = useMemo(() => {
    return new Set([...teamBlue, ...teamRed].filter(Boolean))
  }, [teamBlue, teamRed])

  const availablePlayers = useMemo(() => {
    return allPlayers || []
  }, [allPlayers])

  const setTeamPlayer = (side, idx, pid) => {
    const setter = side === 'blue' ? setTeamBlue : setTeamRed
    setter(prev => {
      const next = [...prev]
      next[idx] = pid
      return next
    })
  }

  const winningTeam = useMemo(() => {
    if (!winner) return []
    const ids = winner === 'Blue' ? teamBlue : teamRed
    return ids.filter(Boolean).map(id => availablePlayers.find(p => p.id === id)).filter(Boolean)
  }, [winner, teamBlue, teamRed, availablePlayers])

  const losingTeam = useMemo(() => {
    if (!winner) return []
    const ids = winner === 'Blue' ? teamRed : teamBlue
    return ids.filter(Boolean).map(id => availablePlayers.find(p => p.id === id)).filter(Boolean)
  }, [winner, teamBlue, teamRed, availablePlayers])

  const allFilled = teamBlue.every(Boolean) && teamRed.every(Boolean)
  const canSubmit = allFilled && winner && mvpId && aceId && matchDate && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      await api.createHistoricalMatch({
        team_blue: teamBlue,
        team_red: teamRed,
        picks_blue: picksBlue,
        picks_red: picksRed,
        bans_blue: bansBlue,
        bans_red: bansRed,
        winner,
        mvp_player_id: mvpId,
        ace_player_id: aceId,
        timestamp: new Date(matchDate).toISOString(),
      })
      onCreated()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const renderTeamSelector = (side, team, picks, bans, setPick, setBan) => {
    const color = side === 'blue'
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-3 h-3 rounded-full ${color ? 'bg-blue-glow' : 'bg-red-glow'}`} />
          <h3 className={`text-sm font-bold uppercase tracking-wider ${color ? 'text-blue-glow' : 'text-red-glow'}`}>
            {side === 'blue' ? 'Blue Team' : 'Red Team'}
          </h3>
        </div>
        {[0, 1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-2">
            <select
              value={team[i] || ''}
              onChange={e => setTeamPlayer(side, i, e.target.value ? Number(e.target.value) : null)}
              className="select-field flex-1 text-sm"
            >
              <option value="">Jugador {i + 1}...</option>
              {availablePlayers.map(p => (
                <option key={p.id} value={p.id}
                  disabled={selectedIds.has(p.id) && team[i] !== p.id}>
                  {p.name} ({Math.round(p.tournament_elo)})
                </option>
              ))}
            </select>
            <div className="w-36">
              <ChampionSelect
                champions={champions}
                value={picks[i]}
                onChange={v => setPick(i, v)}
                placeholder="Champ..."
              />
            </div>
          </div>
        ))}
        <div className="pt-2 border-t border-surface-700/30">
          <p className="text-[10px] text-surface-500 uppercase tracking-widest mb-1">Bans (opcional)</p>
          <div className="flex gap-1.5 flex-wrap">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="w-24">
                <ChampionSelect
                  champions={champions}
                  value={bans[i]}
                  onChange={v => setBan(i, v)}
                  placeholder={`Ban ${i+1}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="glass p-6 space-y-6 animate-slide-up border-2 border-accent/20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Plus size={20} className="text-accent" />
          <h2 className="text-lg font-bold text-white">Anadir Partida Pasada</h2>
        </div>
        <button onClick={onCancel} className="text-surface-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      <p className="text-xs text-surface-400">
        Selecciona los jugadores de cada equipo, sus campeones, el ganador y la fecha.
        El Elo se recalculara cronologicamente teniendo en cuenta todas las partidas.
      </p>

      {/* Date (required) */}
      <div className="flex items-center gap-3">
        <Calendar size={16} className="text-accent" />
        <span className="text-sm font-semibold text-surface-300">Fecha de la partida</span>
        <input
          type="datetime-local"
          value={matchDate}
          onChange={e => setMatchDate(e.target.value)}
          max={new Date().toISOString().slice(0, 16)}
          className="bg-surface-800 border border-surface-700/50 rounded-xl px-4 py-2 text-sm text-white
                     font-mono focus:outline-none focus:border-accent/50 transition-colors [color-scheme:dark]"
          required
        />
        {!matchDate && <span className="text-[10px] text-red-400">* Requerido</span>}
      </div>

      {/* Teams */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderTeamSelector('blue', teamBlue, picksBlue, bansBlue,
          (i, v) => setPicksBlue(prev => { const n = [...prev]; n[i] = v; return n }),
          (i, v) => setBansBlue(prev => { const n = [...prev]; n[i] = v; return n }),
        )}
        {renderTeamSelector('red', teamRed, picksRed, bansRed,
          (i, v) => setPicksRed(prev => { const n = [...prev]; n[i] = v; return n }),
          (i, v) => setBansRed(prev => { const n = [...prev]; n[i] = v; return n }),
        )}
      </div>

      {/* Winner */}
      {allFilled && (
        <div className="space-y-3 animate-fade-in">
          <h3 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">Ganador</h3>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => { setWinner('Blue'); setMvpId(null); setAceId(null) }}
              className={`py-3 rounded-xl text-center font-bold transition-all
                ${winner === 'Blue'
                  ? 'bg-blue-team/30 border-2 border-blue-glow text-blue-glow'
                  : 'bg-surface-800 border-2 border-surface-700/40 text-surface-400 hover:border-surface-500'}`}>
              🔵 Blue Team
            </button>
            <button onClick={() => { setWinner('Red'); setMvpId(null); setAceId(null) }}
              className={`py-3 rounded-xl text-center font-bold transition-all
                ${winner === 'Red'
                  ? 'bg-red-team/30 border-2 border-red-glow text-red-glow'
                  : 'bg-surface-800 border-2 border-surface-700/40 text-surface-400 hover:border-surface-500'}`}>
              🔴 Red Team
            </button>
          </div>
        </div>
      )}

      {/* MVP + ACE */}
      {winner && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Award size={16} className="text-gold" />
              <span className="text-sm font-semibold text-gold uppercase tracking-wider">MVP (Winner) +2</span>
            </div>
            {winningTeam.map(p => (
              <button key={p.id} onClick={() => setMvpId(p.id)}
                className={`w-full text-left px-3 py-2 rounded-xl transition-all flex items-center gap-2 text-sm
                  ${mvpId === p.id
                    ? 'bg-gold/15 border border-gold/40 text-gold'
                    : 'bg-surface-800 border border-surface-700/30 text-surface-300 hover:border-surface-500'}`}>
                {p.name}
                <span className="text-xs font-mono text-surface-400 ml-auto">{Math.round(p.tournament_elo)}</span>
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Shield size={16} className="text-blue-glow" />
              <span className="text-sm font-semibold text-blue-glow uppercase tracking-wider">ACE (Loser) +1</span>
            </div>
            {losingTeam.map(p => (
              <button key={p.id} onClick={() => setAceId(p.id)}
                className={`w-full text-left px-3 py-2 rounded-xl transition-all flex items-center gap-2 text-sm
                  ${aceId === p.id
                    ? 'bg-blue-glow/15 border border-blue-glow/40 text-blue-glow'
                    : 'bg-surface-800 border border-surface-700/30 text-surface-300 hover:border-surface-500'}`}>
                {p.name}
                <span className="text-xs font-mono text-surface-400 ml-auto">{Math.round(p.tournament_elo)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2 border-t border-surface-700/30">
        <button onClick={onCancel} className="btn-ghost text-sm">Cancelar</button>
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Anadir Partida Historica
        </button>
      </div>

      {submitting && (
        <div className="text-center text-xs text-surface-400 animate-pulse">
          Recalculando todo el Elo cronologicamente... esto puede tardar unos segundos.
        </div>
      )}
    </div>
  )
}


/* ── Main page ── */
export default function HistoryPage() {
  const { data: matches, loading, refetch } = useApi(() => api.getMatches())
  const { data: archivedMatches, loading: archLoading, refetch: refetchArchived } = useApi(() => api.getArchivedMatches())
  const { data: allPlayers } = useApi(() => api.getPlayers(false))
  const { data: champions } = useApi(() => api.getChampionList())
  const [players, setPlayers] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [showArchived, setShowArchived] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  const [confirmAction, setConfirmAction] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)

  // Champion names list
  const championNames = useMemo(() => {
    if (!champions) return []
    if (typeof champions[0] === 'string') return champions
    return champions.map(c => c.name)
  }, [champions])

  useEffect(() => {
    api.getPlayers(false).then(list => {
      const map = {}
      list.forEach(p => { map[p.id] = p })
      setPlayers(map)
    }).catch(() => {})
  }, [])

  const handleArchive = async (matchId) => {
    setActionLoading(true)
    try {
      await api.archiveMatch(matchId)
      setConfirmAction(null)
      setExpandedId(null)
      refetch()
      refetchArchived()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleRestore = async (matchId) => {
    setActionLoading(true)
    try {
      await api.restoreMatch(matchId)
      setConfirmAction(null)
      setExpandedId(null)
      refetch()
      refetchArchived()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleMatchCreated = () => {
    setShowAddForm(false)
    refetch()
    refetchArchived()
    // Refresh player map (Elo may have changed)
    api.getPlayers(false).then(list => {
      const map = {}
      list.forEach(p => { map[p.id] = p })
      setPlayers(map)
    }).catch(() => {})
  }

  if (loading) return <div className="text-surface-400 text-center py-16">Loading...</div>

  const archivedCount = archivedMatches?.length || 0

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Match History</h1>
          <p className="text-sm text-surface-400 mt-1">
            {matches?.length || 0} partidas jugadas
            {archivedCount > 0 && ` · ${archivedCount} archivadas`}
          </p>
        </div>
        {!showAddForm && (
          <button onClick={() => setShowAddForm(true)}
            className="btn-primary text-sm flex items-center gap-2">
            <Plus size={14} /> Anadir Partida Pasada
          </button>
        )}
      </div>

      {/* Add Past Match Form */}
      {showAddForm && (
        <AddPastMatchForm
          allPlayers={allPlayers}
          champions={championNames}
          onCreated={handleMatchCreated}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Active Matches */}
      {!matches || matches.length === 0 ? (
        <EmptyState icon={ScrollText} title="No matches yet"
          description="Go to the Match page to create your first game" />
      ) : (
        <div className="space-y-3">
          {matches.map(m => {
            const isExpanded = expandedId === m.id
            const isConfirming = confirmAction?.matchId === m.id && confirmAction?.action === 'archive'
            return (
              <MatchCard key={m.id} m={m} players={players} isExpanded={isExpanded}
                onToggle={() => { setExpandedId(isExpanded ? null : m.id); setConfirmAction(null) }}
                actions={
                  <div className="px-5 pb-4">
                    {isConfirming ? (
                      <ConfirmAction
                        message="Se revertiran todos los cambios de Elo, stats y campeones de esta partida. La partida quedara en la seccion de archivadas y podras restaurarla mas tarde."
                        onConfirm={() => handleArchive(m.id)}
                        onCancel={() => setConfirmAction(null)}
                        loading={actionLoading}
                      />
                    ) : (
                      <div className="pt-3 border-t border-surface-700/30 flex justify-end">
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmAction({ matchId: m.id, action: 'archive' }) }}
                          className="text-xs text-surface-500 hover:text-yellow-400 flex items-center gap-1.5 transition-colors">
                          <Archive size={12} /> Archivar partida
                        </button>
                      </div>
                    )}
                  </div>
                }
              />
            )
          })}
        </div>
      )}

      {/* Archived Matches */}
      {archivedCount > 0 && (
        <div className="space-y-3">
          <button onClick={() => setShowArchived(!showArchived)}
            className="w-full glass px-5 py-4 flex items-center gap-3 hover:bg-surface-800/30 transition-colors">
            <Archive size={18} className="text-yellow-400" />
            <span className="text-sm font-semibold text-yellow-400">Partidas Archivadas ({archivedCount})</span>
            <p className="text-[10px] text-surface-500 flex-1 text-left">Elo revertido - se puede restaurar</p>
            {showArchived ? <ChevronUp size={16} className="text-surface-500" /> :
                            <ChevronDown size={16} className="text-surface-500" />}
          </button>

          {showArchived && (
            <div className="space-y-3 pl-2 border-l-2 border-yellow-500/20">
              {archivedMatches.map(m => {
                const isExpanded = expandedId === m.id
                const isConfirming = confirmAction?.matchId === m.id && confirmAction?.action === 'restore'
                return (
                  <MatchCard key={m.id} m={m} players={players} isExpanded={isExpanded}
                    onToggle={() => { setExpandedId(isExpanded ? null : m.id); setConfirmAction(null) }}
                    actions={
                      <div className="px-5 pb-4">
                        {isConfirming ? (
                          <ConfirmAction
                            message="Se recalculara el Elo y se aplicaran de nuevo todos los stats y campeones de esta partida."
                            onConfirm={() => handleRestore(m.id)}
                            onCancel={() => setConfirmAction(null)}
                            loading={actionLoading}
                          />
                        ) : (
                          <div className="pt-3 border-t border-surface-700/30 flex justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmAction({ matchId: m.id, action: 'restore' }) }}
                              className="text-xs text-yellow-400 hover:text-emerald-400 flex items-center gap-1.5 transition-colors">
                              <RotateCcw size={12} /> Restaurar partida
                            </button>
                          </div>
                        )}
                      </div>
                    }
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
