import { useState, useEffect } from 'react'
import {
  getActiveSeason, getSeasons, createSeason, closeSeason,
  archiveSeason, unarchiveSeason, deleteSeason,
  createJornada, closeJornada, deleteJornada, getJornada, linkMatchToJornada,
  computeSeasonAwards, getSeasonAwards, getMatches,
} from '../api/client'
import { Trophy, Calendar, Plus, X, Award, ChevronDown, ChevronUp, Link, Clock, Archive, Trash2, RotateCcw, Lock, Eye, EyeOff } from 'lucide-react'

const AWARD_LABELS = {
  mvp_temporada: { label: 'MVP de la Temporada', emoji: '🏆', desc: 'Más Elo ganado' },
  max_ganador: { label: 'Máximo Ganador', emoji: '👑', desc: 'Mayor % de victorias' },
  resiliente: { label: 'El Resiliente', emoji: '💪', desc: 'Mayor recuperación' },
  iron_wall: { label: 'Iron Wall', emoji: '🛡️', desc: 'Menor pérdida de Elo' },
  clutch: { label: 'El Clutch', emoji: '⚡', desc: 'Mayor ganancia en un partido' },
  mvp_machine: { label: 'MVP Machine', emoji: '🌟', desc: 'Más MVPs' },
  ace_master: { label: 'ACE Master', emoji: '🎯', desc: 'Más ACEs' },
  veterano: { label: 'El Veterano', emoji: '🎖️', desc: 'Más partidos jugados' },
  rising_star: { label: 'Rising Star', emoji: '🚀', desc: 'Más Elo/partido' },
  desafortunado: { label: 'El Desafortunado', emoji: '😢', desc: 'Mayor pérdida de Elo' },
  highest_peak: { label: 'Highest Peak', emoji: '🏔️', desc: 'Elo máximo alcanzado' },
  most_improved: { label: 'Most Improved', emoji: '📈', desc: 'Mayor mejora en la temporada' },
  best_duo: { label: 'Best Duo', emoji: '🤝', desc: 'Mejor pareja (% victoria)' },
  most_games_duo: { label: 'Inseparables', emoji: '👫', desc: 'Más partidos juntos' },
  worst_duo: { label: 'Worst Duo', emoji: '💔', desc: 'Peor pareja (% victoria)' },
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString()
}

export default function SeasonsPage() {
  const [activeSeason, setActiveSeason] = useState(null)
  const [seasons, setSeasons] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [awards, setAwards] = useState([])
  const [viewAwardsSeason, setViewAwardsSeason] = useState(null)
  const [expandedJornada, setExpandedJornada] = useState(null)
  const [jornadaData, setJornadaData] = useState({})
  const [matches, setMatches] = useState([])
  const [showArchived, setShowArchived] = useState(false)

  // Season form
  const [newName, setNewName] = useState('')
  const [seasonStart, setSeasonStart] = useState('')
  const [seasonEnd, setSeasonEnd] = useState('')

  // Jornada form
  const [jornadaName, setJornadaName] = useState('')
  const [jornadaStart, setJornadaStart] = useState('')
  const [jornadaEnd, setJornadaEnd] = useState('')

  // Manual link
  const [linkMatchId, setLinkMatchId] = useState('')
  const [linkJornadaId, setLinkJornadaId] = useState('')

  // Delete password modal
  const [deleteTarget, setDeleteTarget] = useState(null) // { type: 'season', id, name }
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { load() }, [showArchived])

  async function load() {
    setLoading(true)
    try {
      const [active, all, matchList] = await Promise.all([
        getActiveSeason(), getSeasons(showArchived), getMatches(),
      ])
      setActiveSeason(active.active ? active : null)
      setSeasons(all)
      setMatches(matchList)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function handleCreateSeason() {
    if (!newName.trim()) return
    try {
      await createSeason(newName.trim(), seasonStart || null, seasonEnd || null)
      setNewName(''); setSeasonStart(''); setSeasonEnd('')
      setMsg('Season created!')
      load()
    } catch (e) { setMsg('Error: ' + e.message) }
  }

  async function handleCloseSeason(id) {
    if (!confirm('Close this season? This cannot be undone.')) return
    try {
      await closeSeason(id)
      setMsg('Season closed')
      load()
    } catch (e) { setMsg('Error: ' + e.message) }
  }

  async function handleArchiveSeason(id) {
    try {
      await archiveSeason(id)
      setMsg('Season archived')
      load()
    } catch (e) { setMsg('Error: ' + e.message) }
  }

  async function handleUnarchiveSeason(id) {
    try {
      await unarchiveSeason(id)
      setMsg('Season restored')
      load()
    } catch (e) { setMsg('Error: ' + e.message) }
  }

  async function handleDeleteSeason() {
    if (!deleteTarget) return
    setDeleteError('')
    try {
      await deleteSeason(deleteTarget.id, deletePassword)
      setMsg(`Season '${deleteTarget.name}' permanently deleted`)
      setDeleteTarget(null)
      setDeletePassword('')
      load()
    } catch (e) {
      setDeleteError(e.message || 'Wrong password')
    }
  }

  async function handleCreateJornada() {
    if (!activeSeason) return
    try {
      const res = await createJornada(
        activeSeason.season.id,
        jornadaName.trim(),
        jornadaStart || null,
        jornadaEnd || null,
      )
      setJornadaName(''); setJornadaStart(''); setJornadaEnd('')
      setMsg(res.message || 'Jornada created!')
      load()
    } catch (e) { setMsg('Error: ' + e.message) }
  }

  async function handleCloseJornada(jid) {
    if (!confirm('Close this jornada? Decay will be applied to absent players.')) return
    try {
      const res = await closeJornada(jid)
      setMsg(res.message)
      load()
    } catch (e) { setMsg('Error: ' + e.message) }
  }

  async function handleDeleteJornada(jid, name) {
    if (!confirm(`Delete jornada "${name || '#' + jid}"? Matches will be unlinked but not deleted.`)) return
    try {
      await deleteJornada(jid)
      setMsg('Jornada deleted')
      load()
    } catch (e) { setMsg('Error: ' + e.message) }
  }

  async function handleExpandJornada(jid) {
    if (expandedJornada === jid) {
      setExpandedJornada(null)
      return
    }
    try {
      const data = await getJornada(jid)
      setJornadaData(prev => ({ ...prev, [jid]: data }))
      setExpandedJornada(jid)
    } catch (e) { console.error(e) }
  }

  async function handleLinkMatch() {
    if (!linkMatchId || !linkJornadaId) return
    try {
      await linkMatchToJornada(parseInt(linkMatchId), parseInt(linkJornadaId))
      setMsg('Match linked to jornada')
      setLinkMatchId('')
      load()
    } catch (e) { setMsg('Error: ' + e.message) }
  }

  async function handleComputeAwards(seasonId) {
    try {
      const res = await computeSeasonAwards(seasonId)
      setMsg(res.message)
      handleViewAwards(seasonId)
    } catch (e) { setMsg('Error: ' + e.message) }
  }

  async function handleViewAwards(seasonId) {
    try {
      const a = await getSeasonAwards(seasonId)
      setAwards(a)
      setViewAwardsSeason(seasonId)
    } catch (e) { console.error(e) }
  }

  if (loading) return <div className="p-8 text-surface-400">Loading...</div>

  const finishedSeasons = seasons.filter(s => s.status === 'finished' && !s.archived)
  const archivedSeasons = seasons.filter(s => s.archived)

  return (
    <div className="p-6 lg:p-8 space-y-8 max-w-5xl">
      <h2 className="text-2xl font-bold text-white flex items-center gap-3">
        <Calendar className="text-accent" size={28} /> Seasons & Jornadas
      </h2>

      {msg && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-3 text-sm text-accent flex items-center justify-between">
          {msg}
          <button onClick={() => setMsg('')} className="text-accent/60 hover:text-accent"><X size={16} /></button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setDeleteTarget(null); setDeletePassword(''); setDeleteError('') }}>
          <div className="bg-surface-800 border border-surface-700/50 rounded-2xl p-6 w-full max-w-sm space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-bold">Delete Season</h3>
                <p className="text-xs text-surface-400">"{deleteTarget.name}" — this is permanent</p>
              </div>
            </div>
            <p className="text-sm text-surface-300">All jornadas, match links, and awards for this season will be permanently deleted. Matches themselves won't be removed.</p>
            <div>
              <label className="text-xs text-surface-400 mb-1 block">Enter admin password to confirm</label>
              <input
                type="password"
                value={deletePassword}
                onChange={e => { setDeletePassword(e.target.value); setDeleteError('') }}
                placeholder="Password"
                autoFocus
                className={`w-full bg-surface-900 border rounded-lg px-3 py-2 text-sm text-white font-mono
                           placeholder:text-surface-600 focus:outline-none transition-colors
                           ${deleteError ? 'border-red-500/60' : 'border-surface-700/50 focus:border-accent/50'}`}
                onKeyDown={e => e.key === 'Enter' && handleDeleteSeason()}
              />
              {deleteError && <p className="text-xs text-red-400 mt-1">{deleteError}</p>}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDeleteTarget(null); setDeletePassword(''); setDeleteError('') }}
                      className="px-4 py-2 text-sm text-surface-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={handleDeleteSeason}
                      disabled={!deletePassword}
                      className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-semibold hover:bg-red-500/30 disabled:opacity-40 flex items-center gap-1.5">
                <Lock size={14} /> Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Season */}
      {activeSeason ? (
        <div className="bg-surface-800/60 rounded-2xl border border-surface-700/40 p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Trophy className="text-yellow-400" size={20} />
                {activeSeason.season.name}
                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Active</span>
              </h3>
              <div className="flex items-center gap-3 mt-1 text-xs text-surface-400">
                <span>Created: {formatDate(activeSeason.season.started_at)}</span>
                {activeSeason.season.start_date && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {formatDate(activeSeason.season.start_date)} — {formatDate(activeSeason.season.end_date)}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleComputeAwards(activeSeason.season.id)}
                      className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm hover:bg-yellow-500/30 flex items-center gap-1">
                <Award size={14} /> Awards
              </button>
              <button onClick={() => handleCloseSeason(activeSeason.season.id)}
                      className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30">
                Close Season
              </button>
            </div>
          </div>

          {/* Jornadas */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-surface-300">Jornadas</h4>
            {activeSeason.jornadas?.length > 0 ? (
              activeSeason.jornadas.map(j => (
                <div key={j.id} className="bg-surface-900/60 rounded-xl border border-surface-700/30 overflow-hidden">
                  <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-surface-800/60"
                       onClick={() => handleExpandJornada(j.id)}>
                    <div className="flex items-center gap-2 flex-wrap">
                      {expandedJornada === j.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      <span className="text-sm text-white font-medium">
                        {j.name || `Jornada #${j.id}`}
                      </span>
                      {j.closed ? (
                        <span className="text-[10px] bg-surface-700 text-surface-400 px-1.5 py-0.5 rounded">Closed</span>
                      ) : (
                        <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">Open</span>
                      )}
                      {(j.start_date || j.end_date) && (
                        <span className="text-[10px] text-surface-400 font-mono flex items-center gap-1">
                          <Clock size={10} />
                          {formatDate(j.start_date)} — {formatDate(j.end_date)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!j.closed && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteJornada(j.id, j.name) }}
                                  className="text-xs text-surface-500 hover:text-red-400 px-1.5 py-1 rounded transition-colors"
                                  title="Delete jornada">
                            <Trash2 size={13} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleCloseJornada(j.id) }}
                                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 bg-red-500/10 rounded">
                            Close
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {expandedJornada === j.id && jornadaData[j.id] && (
                    <div className="px-3 pb-3 border-t border-surface-700/30 pt-2">
                      {jornadaData[j.id].matches?.length > 0 ? (
                        <div className="space-y-1">
                          {jornadaData[j.id].matches.map(m => (
                            <div key={m.id} className="text-xs text-surface-400 flex justify-between">
                              <span>Match #{m.id} — {m.winner} wins</span>
                              <span>{new Date(m.timestamp).toLocaleDateString()}</span>
                            </div>
                          ))}
                          <p className="text-[10px] text-surface-500 mt-1">{jornadaData[j.id].matches.length} match(es)</p>
                        </div>
                      ) : (
                        <p className="text-xs text-surface-500">No matches linked yet</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-surface-500">No jornadas yet</p>
            )}

            {/* Create Jornada */}
            <div className="bg-surface-900/40 rounded-xl border border-surface-700/20 p-3 space-y-2 mt-3">
              <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">New Jornada</p>
              <div className="flex gap-2">
                <input value={jornadaName} onChange={e => setJornadaName(e.target.value)}
                       placeholder="Name (e.g. Jornada 1)"
                       className="flex-1 bg-surface-900/60 border border-surface-700/40 rounded-lg px-3 py-1.5 text-sm text-white placeholder-surface-500 focus:border-accent/50 focus:outline-none" />
              </div>
              <div className="flex gap-2 items-center">
                <div className="flex-1">
                  <label className="text-[10px] text-surface-500 mb-0.5 block">Start date</label>
                  <input type="date" value={jornadaStart} onChange={e => setJornadaStart(e.target.value)}
                         className="w-full bg-surface-900/60 border border-surface-700/40 rounded-lg px-3 py-1.5 text-sm text-white focus:border-accent/50 focus:outline-none" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-surface-500 mb-0.5 block">End date</label>
                  <input type="date" value={jornadaEnd} onChange={e => setJornadaEnd(e.target.value)}
                         className="w-full bg-surface-900/60 border border-surface-700/40 rounded-lg px-3 py-1.5 text-sm text-white focus:border-accent/50 focus:outline-none" />
                </div>
                <button onClick={handleCreateJornada}
                        className="px-3 py-1.5 bg-accent/20 text-accent rounded-lg text-sm hover:bg-accent/30 flex items-center gap-1 self-end">
                  <Plus size={14} /> Add
                </button>
              </div>
              {jornadaStart && jornadaEnd && (
                <p className="text-[10px] text-accent/80">
                  Matches played between {jornadaStart} and {jornadaEnd} will be auto-linked.
                </p>
              )}
            </div>

            {/* Manual link */}
            {activeSeason.jornadas?.some(j => !j.closed) && (
              <div className="bg-surface-900/40 rounded-xl border border-surface-700/20 p-3 space-y-2">
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider flex items-center gap-1">
                  <Link size={12} /> Manual Link
                </p>
                <div className="flex gap-2 items-center">
                  <select value={linkMatchId} onChange={e => setLinkMatchId(e.target.value)}
                          className="flex-1 bg-surface-900/60 border border-surface-700/40 rounded-lg px-3 py-1.5 text-sm text-white focus:border-accent/50 focus:outline-none">
                    <option value="">Select match...</option>
                    {matches.slice(0, 30).map(m => (
                      <option key={m.id} value={m.id}>
                        #{m.id} — {m.winner} ({new Date(m.timestamp).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                  <select value={linkJornadaId} onChange={e => setLinkJornadaId(e.target.value)}
                          className="bg-surface-900/60 border border-surface-700/40 rounded-lg px-3 py-1.5 text-sm text-white focus:border-accent/50 focus:outline-none">
                    <option value="">Jornada...</option>
                    {activeSeason.jornadas?.filter(j => !j.closed).map(j => (
                      <option key={j.id} value={j.id}>{j.name || `#${j.id}`}</option>
                    ))}
                  </select>
                  <button onClick={handleLinkMatch}
                          className="px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30">
                    Link
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-surface-800/60 rounded-2xl border border-surface-700/40 p-6 space-y-3">
          <p className="text-surface-400 text-sm mb-1">No active season. Create one to start tracking jornadas and awards.</p>
          <div className="flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)}
                   placeholder="Season name (e.g. Season 1)"
                   className="flex-1 bg-surface-900/60 border border-surface-700/40 rounded-lg px-3 py-2 text-sm text-white placeholder-surface-500 focus:border-accent/50 focus:outline-none" />
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <label className="text-[10px] text-surface-500 mb-0.5 block">Season start</label>
              <input type="date" value={seasonStart} onChange={e => setSeasonStart(e.target.value)}
                     className="w-full bg-surface-900/60 border border-surface-700/40 rounded-lg px-3 py-1.5 text-sm text-white focus:border-accent/50 focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-surface-500 mb-0.5 block">Season end</label>
              <input type="date" value={seasonEnd} onChange={e => setSeasonEnd(e.target.value)}
                     className="w-full bg-surface-900/60 border border-surface-700/40 rounded-lg px-3 py-2 text-sm text-white focus:border-accent/50 focus:outline-none" />
            </div>
            <button onClick={handleCreateSeason}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/80 flex items-center gap-1 self-end">
              <Plus size={16} /> Create
            </button>
          </div>
        </div>
      )}

      {/* Awards */}
      {viewAwardsSeason && awards.length > 0 && (
        <div className="bg-surface-800/60 rounded-2xl border border-surface-700/40 p-6 space-y-3">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Award className="text-yellow-400" size={20} /> Season Awards
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {awards.map(a => {
              const meta = AWARD_LABELS[a.award_type] || { label: a.award_type, emoji: '🏅', desc: '' }
              const name = a.winner_name || (a.player_a_name && a.player_b_name
                ? `${a.player_a_name} & ${a.player_b_name}` : 'N/A')
              return (
                <div key={a.id} className="bg-surface-900/60 rounded-xl border border-surface-700/30 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{meta.emoji}</span>
                    <span className="text-sm font-semibold text-white">{meta.label}</span>
                  </div>
                  <p className="text-accent font-bold text-sm">{name}</p>
                  <p className="text-[11px] text-surface-400">{meta.desc} — {a.value != null ? a.value : ''}</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Past Seasons (not archived) */}
      {finishedSeasons.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-surface-300">Past Seasons</h3>
          {finishedSeasons.map(s => (
            <div key={s.id} className="bg-surface-800/40 rounded-xl border border-surface-700/30 p-4 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-white">{s.name}</span>
                <span className="text-xs text-surface-400 ml-2">
                  {s.start_date ? `${formatDate(s.start_date)} — ${formatDate(s.end_date)}` :
                   `${formatDate(s.started_at)} — ${s.ended_at ? formatDate(s.ended_at) : '?'}`}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => handleViewAwards(s.id)}
                        className="text-xs text-yellow-400 hover:text-yellow-300 px-2 py-1 bg-yellow-500/10 rounded">
                  Awards
                </button>
                <button onClick={() => handleArchiveSeason(s.id)}
                        className="text-xs text-surface-400 hover:text-amber-400 px-2 py-1 bg-surface-700/30 rounded flex items-center gap-1"
                        title="Archive season">
                  <Archive size={12} /> Archive
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Archived Seasons */}
      <div className="space-y-3">
        <button onClick={() => setShowArchived(!showArchived)}
                className="flex items-center gap-2 text-sm text-surface-400 hover:text-surface-200 transition-colors">
          {showArchived ? <EyeOff size={16} /> : <Eye size={16} />}
          {showArchived ? 'Hide' : 'Show'} archived seasons
          {archivedSeasons.length > 0 && <span className="text-xs bg-surface-700 px-1.5 py-0.5 rounded">{archivedSeasons.length}</span>}
        </button>

        {showArchived && archivedSeasons.length > 0 && (
          <div className="space-y-2">
            {archivedSeasons.map(s => (
              <div key={s.id} className="bg-surface-900/40 rounded-xl border border-surface-700/20 p-4 flex items-center justify-between opacity-70">
                <div>
                  <span className="text-sm font-medium text-surface-300">{s.name}</span>
                  <span className="text-xs text-surface-500 ml-2">
                    {s.start_date ? `${formatDate(s.start_date)} — ${formatDate(s.end_date)}` :
                     `${formatDate(s.started_at)} — ${s.ended_at ? formatDate(s.ended_at) : '?'}`}
                  </span>
                  <span className="text-[10px] bg-surface-700 text-surface-500 px-1.5 py-0.5 rounded ml-2">Archived</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleViewAwards(s.id)}
                          className="text-xs text-yellow-400/60 hover:text-yellow-400 px-2 py-1 bg-yellow-500/5 rounded">
                    Awards
                  </button>
                  <button onClick={() => handleUnarchiveSeason(s.id)}
                          className="text-xs text-surface-400 hover:text-emerald-400 px-2 py-1 bg-surface-700/30 rounded flex items-center gap-1"
                          title="Restore season">
                    <RotateCcw size={12} /> Restore
                  </button>
                  <button onClick={() => setDeleteTarget({ type: 'season', id: s.id, name: s.name })}
                          className="text-xs text-surface-500 hover:text-red-400 px-2 py-1 bg-red-500/5 rounded flex items-center gap-1"
                          title="Delete permanently">
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showArchived && archivedSeasons.length === 0 && (
          <p className="text-xs text-surface-500 ml-7">No archived seasons</p>
        )}
      </div>
    </div>
  )
}
