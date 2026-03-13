import { useState, useMemo } from 'react'
import { GitCompareArrows, Handshake, Swords, Award, Shield, Loader2, TrendingUp, TrendingDown, Users } from 'lucide-react'
import Badge from '../components/Badge'
import EloChange from '../components/EloChange'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import { useApi } from '../hooks/useApi'
import * as api from '../api/client'

export default function VersusPage() {
  const { data: players } = useApi(() => api.getPlayers(false))
  const [idA, setIdA] = useState('')
  const [idB, setIdB] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleCompare = async () => {
    if (!idA || !idB || idA === idB) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.getVersusStats(idA, idB)
      setData(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const pMap = useMemo(() => {
    const m = {}
    players?.forEach(p => { m[p.id] = p })
    return m
  }, [players])

  const pa = data?.player_a
  const pb = data?.player_b
  const syn = data?.synergy
  const riv = data?.rivalry
  const awards = data?.awards

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Versus</h1>
        <p className="text-sm text-surface-400 mt-1">Compara la sinergia y enfrentamientos entre dos jugadores</p>
      </div>

      {/* Player Selectors */}
      <div className="glass p-6">
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 w-full">
            <label className="text-[10px] font-semibold text-surface-400 uppercase tracking-widest mb-1.5 block">
              Jugador A
            </label>
            <select
              value={idA}
              onChange={(e) => { setIdA(e.target.value); setData(null) }}
              className="select-field"
            >
              <option value="">Seleccionar jugador...</option>
              {players?.map(p => (
                <option key={p.id} value={p.id} disabled={String(p.id) === idB}>
                  {p.name} ({p.lol_name_tag}) — {Math.round(p.tournament_elo)}
                </option>
              ))}
            </select>
          </div>

          <div className="shrink-0 mt-5">
            <div className="w-10 h-10 rounded-full bg-surface-800 border border-surface-600/50
                            flex items-center justify-center">
              <GitCompareArrows size={18} className="text-accent" />
            </div>
          </div>

          <div className="flex-1 w-full">
            <label className="text-[10px] font-semibold text-surface-400 uppercase tracking-widest mb-1.5 block">
              Jugador B
            </label>
            <select
              value={idB}
              onChange={(e) => { setIdB(e.target.value); setData(null) }}
              className="select-field"
            >
              <option value="">Seleccionar jugador...</option>
              {players?.map(p => (
                <option key={p.id} value={p.id} disabled={String(p.id) === idA}>
                  {p.name} ({p.lol_name_tag}) — {Math.round(p.tournament_elo)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-center mt-5">
          <button
            onClick={handleCompare}
            disabled={!idA || !idB || idA === idB || loading}
            className="btn-primary flex items-center gap-2 disabled:opacity-40"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <GitCompareArrows size={16} />}
            Comparar
          </button>
        </div>

        {error && <p className="text-sm text-red-400 text-center mt-3">{error}</p>}
      </div>

      {/* No selection yet */}
      {!data && !loading && (
        <EmptyState
          icon={GitCompareArrows}
          title="Selecciona dos jugadores"
          description="Elige dos jugadores arriba y pulsa Comparar para ver sus estadísticas cruzadas"
        />
      )}

      {/* Results */}
      {data && pa && pb && (
        <div className="space-y-6 animate-slide-up">

          {/* Player Cards Header */}
          <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center">
            <PlayerHeader player={pa} />
            <div className="text-center">
              <span className="text-xs font-bold text-surface-500 uppercase tracking-widest">VS</span>
              <p className="text-lg font-bold text-accent">{data.total_shared_matches}</p>
              <p className="text-[10px] text-surface-500 uppercase">partidas juntos</p>
            </div>
            <PlayerHeader player={pb} align="right" />
          </div>

          {/* ── Synergy Section ──────────────────────────────── */}
          <div className="glass overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-700/40 bg-gradient-to-r from-emerald-500/5 to-transparent">
              <div className="flex items-center gap-2">
                <Handshake size={18} className="text-emerald-400" />
                <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                  Sinergia (mismo equipo)
                </h2>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {syn.games === 0 ? (
                <p className="text-sm text-surface-400 text-center py-4">
                  No han jugado juntos en el mismo equipo todavía
                </p>
              ) : (
                <>
                  {/* KPIs */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <MiniStat label="Partidas" value={syn.games} />
                    <MiniStat label="Victorias" value={syn.wins} color="text-emerald-400" />
                    <MiniStat label="Derrotas" value={syn.losses} color="text-red-400" />
                    <MiniStat
                      label="Win Rate"
                      value={`${syn.win_rate}%`}
                      color={syn.win_rate >= 55 ? 'text-emerald-400' : syn.win_rate <= 45 ? 'text-red-400' : 'text-white'}
                    />
                  </div>

                  {/* Synergy bar */}
                  <div>
                    <div className="flex justify-between text-xs text-surface-400 mb-1">
                      <span>{syn.wins}W</span>
                      <span>{syn.losses}L</span>
                    </div>
                    <div className="h-3 rounded-full bg-surface-800 overflow-hidden flex">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-500"
                        style={{ width: `${syn.win_rate}%` }}
                      />
                      <div
                        className="bg-red-500/60 h-full transition-all duration-500"
                        style={{ width: `${100 - syn.win_rate}%` }}
                      />
                    </div>
                  </div>

                  {/* Champions played together */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ChampBox title={`${pa.name} juega`} champs={syn.champions_a} />
                    <ChampBox title={`${pb.name} juega`} champs={syn.champions_b} />
                  </div>

                  {/* Elo earned together */}
                  <div>
                    <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
                      Elo ganado/perdido juntos
                    </h4>
                    <div className="flex gap-3">
                      {syn.elo_history.map((h, i) => (
                        <div key={i} className="glass-sm px-3 py-2 text-center">
                          <p className="text-[10px] text-surface-500">Match #{i + 1}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-surface-300">{pa.name}:</span>
                            <EloChange delta={h.delta_a} size="sm" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-surface-300">{pb.name}:</span>
                            <EloChange delta={h.delta_b} size="sm" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Rivalry Section ──────────────────────────────── */}
          <div className="glass overflow-hidden">
            <div className="px-5 py-3 border-b border-surface-700/40 bg-gradient-to-r from-red-500/5 to-transparent">
              <div className="flex items-center gap-2">
                <Swords size={18} className="text-red-400" />
                <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider">
                  Enfrentamientos (equipos opuestos)
                </h2>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {riv.games === 0 ? (
                <p className="text-sm text-surface-400 text-center py-4">
                  No se han enfrentado todavía
                </p>
              ) : (
                <>
                  {/* Head-to-head bar */}
                  <div className="flex items-center gap-4">
                    <div className="text-center shrink-0">
                      <p className="text-2xl font-bold text-blue-glow">{riv.a_wins}</p>
                      <p className="text-[10px] text-surface-400 uppercase">{pa.name}</p>
                    </div>
                    <div className="flex-1">
                      <div className="h-4 rounded-full bg-surface-800 overflow-hidden flex">
                        {riv.games > 0 && (
                          <>
                            <div
                              className="bg-blue-glow h-full transition-all duration-500 flex items-center justify-center"
                              style={{ width: `${(riv.a_wins / riv.games) * 100}%` }}
                            >
                              {riv.a_wins > 0 && (
                                <span className="text-[10px] font-bold text-white">{riv.a_wins}</span>
                              )}
                            </div>
                            <div
                              className="bg-red-glow h-full transition-all duration-500 flex items-center justify-center"
                              style={{ width: `${(riv.b_wins / riv.games) * 100}%` }}
                            >
                              {riv.b_wins > 0 && (
                                <span className="text-[10px] font-bold text-white">{riv.b_wins}</span>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                      <p className="text-center text-[10px] text-surface-500 mt-1">
                        {riv.games} enfrentamiento{riv.games !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="text-center shrink-0">
                      <p className="text-2xl font-bold text-red-glow">{riv.b_wins}</p>
                      <p className="text-[10px] text-surface-400 uppercase">{pb.name}</p>
                    </div>
                  </div>

                  {/* Champions when facing each other */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <ChampBox title={`${pa.name} usa contra ${pb.name}`} champs={riv.champions_a} accent="blue" />
                    <ChampBox title={`${pb.name} usa contra ${pa.name}`} champs={riv.champions_b} accent="red" />
                  </div>

                  {/* Match-by-match */}
                  <div>
                    <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">
                      Historial de enfrentamientos
                    </h4>
                    <div className="space-y-2">
                      {riv.elo_history.map((h, i) => (
                        <div key={i} className="glass-sm px-4 py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-surface-500">#{i + 1}</span>
                            <span className={`text-sm font-semibold ${h.a_won ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pa.name} {h.a_won ? 'WON' : 'LOST'}
                            </span>
                          </div>
                          <div className="flex items-center gap-6">
                            <div className="text-right">
                              <span className="text-xs text-surface-400">{pa.name}: </span>
                              <EloChange delta={h.delta_a} size="sm" />
                            </div>
                            <div className="text-right">
                              <span className="text-xs text-surface-400">{pb.name}: </span>
                              <EloChange delta={h.delta_b} size="sm" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Awards in Shared Matches ─────────────────────── */}
          <div className="glass p-5">
            <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-4">
              Premios en partidas compartidas
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-sm font-semibold text-white">{pa.name}</p>
                <div className="flex items-center gap-3">
                  <Badge variant="mvp" size="md" />
                  <span className="text-lg font-bold text-gold">{awards.mvp_a}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="ace" size="md" />
                  <span className="text-lg font-bold text-blue-glow">{awards.ace_a}</span>
                </div>
              </div>
              <div className="space-y-3 text-right">
                <p className="text-sm font-semibold text-white">{pb.name}</p>
                <div className="flex items-center gap-3 justify-end">
                  <span className="text-lg font-bold text-gold">{awards.mvp_b}</span>
                  <Badge variant="mvp" size="md" />
                </div>
                <div className="flex items-center gap-3 justify-end">
                  <span className="text-lg font-bold text-blue-glow">{awards.ace_b}</span>
                  <Badge variant="ace" size="md" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Quick comparison ─────────────────────────────── */}
          <div className="glass p-5">
            <h2 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-4">
              Comparación general
            </h2>
            <div className="space-y-3">
              <CompareRow label="Tournament Elo" a={Math.round(pa.tournament_elo)} b={Math.round(pb.tournament_elo)} />
              <CompareRow label="API Elo" a={Math.round(pa.api_elo)} b={Math.round(pb.api_elo)} />
              <CompareRow label="Partidas" a={pa.games_played} b={pb.games_played} />
              <CompareRow
                label="Win Rate"
                a={pa.games_played > 0 ? `${Math.round(pa.wins / pa.games_played * 100)}%` : '—'}
                b={pb.games_played > 0 ? `${Math.round(pb.wins / pb.games_played * 100)}%` : '—'}
                aNum={pa.games_played > 0 ? pa.wins / pa.games_played : 0}
                bNum={pb.games_played > 0 ? pb.wins / pb.games_played : 0}
              />
              <CompareRow label="MVPs totales" a={pa.mvp_count} b={pb.mvp_count} />
              <CompareRow label="ACEs totales" a={pa.ace_count} b={pb.ace_count} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ── Helper components ────────────────────────────────────────────────────────

function PlayerHeader({ player, align = 'left' }) {
  return (
    <div className={`flex items-center gap-3 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-accent/30 to-surface-700
                      flex items-center justify-center text-xl font-bold text-white shrink-0">
        {player.name.charAt(0)}
      </div>
      <div>
        <p className="text-lg font-bold text-white">{player.name}</p>
        <p className="text-xs text-surface-400">{player.lol_name_tag}</p>
        <p className="text-sm font-mono text-accent">{Math.round(player.tournament_elo)} Elo</p>
      </div>
    </div>
  )
}

function MiniStat({ label, value, color = 'text-white' }) {
  return (
    <div className="glass-sm px-4 py-3 text-center">
      <p className="text-[10px] text-surface-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  )
}

function ChampBox({ title, champs, accent = 'emerald' }) {
  if (!champs || champs.length === 0) return null
  const accentColor = accent === 'blue' ? 'text-blue-glow' : accent === 'red' ? 'text-red-glow' : 'text-emerald-400'
  const barColor = accent === 'blue' ? 'bg-blue-glow/60' : accent === 'red' ? 'bg-red-glow/60' : 'bg-emerald-500/60'

  return (
    <div>
      <h4 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-2">{title}</h4>
      <div className="space-y-1.5">
        {champs.slice(0, 5).map(c => {
          const wr = c.picks > 0 ? Math.round(c.wins / c.picks * 100) : 0
          return (
            <div key={c.champion} className="flex items-center gap-2">
              <span className="text-sm text-white w-24 truncate">{c.champion}</span>
              <span className="text-[10px] text-surface-500 w-8">{c.picks}g</span>
              <div className="flex-1 h-1.5 bg-surface-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barColor}`} style={{ width: `${wr}%` }} />
              </div>
              <span className={`text-xs font-mono w-10 text-right ${accentColor}`}>{wr}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CompareRow({ label, a, b, aNum, bNum }) {
  // Determine who's "ahead" for highlighting
  const numA = aNum ?? (typeof a === 'number' ? a : parseFloat(a) || 0)
  const numB = bNum ?? (typeof b === 'number' ? b : parseFloat(b) || 0)
  const aWins = numA > numB
  const bWins = numB > numA
  const tied = numA === numB

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center py-1.5 border-b border-surface-700/20 last:border-0">
      <div className="text-right">
        <span className={`text-sm font-mono font-semibold
          ${aWins ? 'text-emerald-400' : tied ? 'text-surface-200' : 'text-surface-400'}`}>
          {a}
        </span>
      </div>
      <span className="text-[10px] text-surface-500 font-semibold uppercase tracking-wider text-center w-24">
        {label}
      </span>
      <div className="text-left">
        <span className={`text-sm font-mono font-semibold
          ${bWins ? 'text-emerald-400' : tied ? 'text-surface-200' : 'text-surface-400'}`}>
          {b}
        </span>
      </div>
    </div>
  )
}
