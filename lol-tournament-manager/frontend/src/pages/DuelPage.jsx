import { useState, useMemo } from 'react'
import { Swords, Trophy, Flame, Plus, X, Loader2, ChevronDown, ChevronUp, ScrollText, Crown, Target, Shield as ShieldIcon, Info } from 'lucide-react'
import ChampionIcon from '../components/ChampionIcon'
import ChampionSelect from '../components/ChampionSelect'
import EloChange from '../components/EloChange'
import EmptyState from '../components/EmptyState'
import { useApi } from '../hooks/useApi'
import * as api from '../api/client'

const WIN_CONDITIONS = [
  { id: 'first_kill', label: 'Primera Muerte', icon: '💀' },
  { id: 'first_tower', label: 'Primera Torreta', icon: '🏰' },
  { id: 'cs_100', label: '100 Minions', icon: '⚔️' },
]

/* ── Create Duel Form ── */
function CreateDuelForm({ allPlayers, champions, onCreated, onCancel }) {
  const [player1, setPlayer1] = useState(null)
  const [player2, setPlayer2] = useState(null)
  const [champion1, setChampion1] = useState('')
  const [champion2, setChampion2] = useState('')
  const [ban1, setBan1] = useState('')
  const [ban2, setBan2] = useState('')
  const [winnerId, setWinnerId] = useState(null)
  const [winCondition, setWinCondition] = useState('first_kill')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const p1Data = useMemo(() => allPlayers?.find(p => p.id === player1), [allPlayers, player1])
  const p2Data = useMemo(() => allPlayers?.find(p => p.id === player2), [allPlayers, player2])

  const canSubmit = player1 && player2 && winnerId && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const res = await api.createDuel({
        player1_id: player1,
        player2_id: player2,
        champion1, champion2,
        ban1, ban2,
        winner_id: winnerId,
        win_condition: winCondition,
      })
      setResult(res)
      onCreated()
    } catch (e) {
      alert('Error: ' + e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className="glass p-6 space-y-4 border-2 border-accent/20 animate-fade-in">
        <div className="text-center">
          <div className="text-3xl mb-2">⚔️</div>
          <h2 className="text-lg font-bold text-white">Duelo #{result.match_id} Registrado</h2>
          <p className="text-sm text-accent mt-1">
            {result.player1.id === winnerId ? result.player1.name : result.player2.name} gana!
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[result.player1, result.player2].map(p => (
            <div key={p.id} className={`glass-sm p-4 text-center ${p.id === winnerId ? 'border border-gold/30' : ''}`}>
              {p.id === winnerId && <Crown size={16} className="text-gold mx-auto mb-1" />}
              <p className="text-sm font-semibold text-white">{p.name}</p>
              <p className="text-xs font-mono text-surface-400 mt-1">
                {Math.round(p.elo_before)} → {Math.round(p.elo_after)}
              </p>
              <EloChange delta={p.delta} size="lg" />
            </div>
          ))}
        </div>
        <div className="flex justify-center">
          <button onClick={() => { setResult(null); setPlayer1(null); setPlayer2(null); setChampion1(''); setChampion2(''); setBan1(''); setBan2(''); setWinnerId(null) }}
            className="btn-primary text-sm">
            <Swords size={14} className="inline mr-1" /> Nuevo Duelo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="glass p-6 space-y-5 border-2 border-accent/20 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Swords size={20} className="text-accent" />
          <h2 className="text-lg font-bold text-white">Nuevo Duelo 1v1</h2>
        </div>
        <button onClick={onCancel} className="text-surface-400 hover:text-white"><X size={20} /></button>
      </div>

      {/* Players */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-semibold text-blue-glow uppercase tracking-wider">Jugador 1</label>
          <select value={player1 || ''} onChange={e => { setPlayer1(e.target.value ? Number(e.target.value) : null); setWinnerId(null) }}
            className="select-field w-full">
            <option value="">Seleccionar...</option>
            {allPlayers?.map(p => (
              <option key={p.id} value={p.id} disabled={p.id === player2}>{p.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <div className="flex-1">
              <ChampionSelect champions={champions} value={champion1} onChange={setChampion1} placeholder="Champion..." />
            </div>
            <div className="w-24">
              <ChampionSelect champions={champions} value={ban1} onChange={setBan1} placeholder="Ban" />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold text-red-glow uppercase tracking-wider">Jugador 2</label>
          <select value={player2 || ''} onChange={e => { setPlayer2(e.target.value ? Number(e.target.value) : null); setWinnerId(null) }}
            className="select-field w-full">
            <option value="">Seleccionar...</option>
            {allPlayers?.map(p => (
              <option key={p.id} value={p.id} disabled={p.id === player1}>{p.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <div className="flex-1">
              <ChampionSelect champions={champions} value={champion2} onChange={setChampion2} placeholder="Champion..." />
            </div>
            <div className="w-24">
              <ChampionSelect champions={champions} value={ban2} onChange={setBan2} placeholder="Ban" />
            </div>
          </div>
        </div>
      </div>

      {/* Win condition */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Condicion de victoria</label>
        <div className="flex gap-2">
          {WIN_CONDITIONS.map(wc => (
            <button key={wc.id} onClick={() => setWinCondition(wc.id)}
              className={`flex-1 py-2 px-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2
                ${winCondition === wc.id
                  ? 'bg-accent/20 border-2 border-accent text-accent'
                  : 'bg-surface-800 border-2 border-surface-700/40 text-surface-400 hover:border-surface-500'}`}>
              <span>{wc.icon}</span> {wc.label}
            </button>
          ))}
        </div>
      </div>

      {/* Winner */}
      {player1 && player2 && (
        <div className="space-y-2 animate-fade-in">
          <label className="text-xs font-semibold text-surface-400 uppercase tracking-wider">Ganador</label>
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => setWinnerId(player1)}
              className={`py-3 rounded-xl text-center font-bold transition-all
                ${winnerId === player1
                  ? 'bg-gold/20 border-2 border-gold text-gold'
                  : 'bg-surface-800 border-2 border-surface-700/40 text-surface-400 hover:border-surface-500'}`}>
              {winnerId === player1 && <Crown size={14} className="inline mr-1" />}
              {p1Data?.name || 'Jugador 1'}
            </button>
            <button onClick={() => setWinnerId(player2)}
              className={`py-3 rounded-xl text-center font-bold transition-all
                ${winnerId === player2
                  ? 'bg-gold/20 border-2 border-gold text-gold'
                  : 'bg-surface-800 border-2 border-surface-700/40 text-surface-400 hover:border-surface-500'}`}>
              {winnerId === player2 && <Crown size={14} className="inline mr-1" />}
              {p2Data?.name || 'Jugador 2'}
            </button>
          </div>
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2 border-t border-surface-700/30">
        <button onClick={onCancel} className="btn-ghost text-sm">Cancelar</button>
        <button onClick={handleSubmit} disabled={!canSubmit}
          className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40">
          {submitting ? <Loader2 size={14} className="animate-spin" /> : <Swords size={14} />}
          Registrar Duelo
        </button>
      </div>
    </div>
  )
}


/* ── Main Page ── */
export default function DuelPage() {
  const { data: rankings, loading: rLoading, refetch: refetchRankings } = useApi(() => api.getDuelRankings())
  const { data: matches, loading: mLoading, refetch: refetchMatches } = useApi(() => api.getDuelMatches())
  const { data: stats, refetch: refetchStats } = useApi(() => api.getDuelStats())
  const { data: allPlayers } = useApi(() => api.getPlayers(true))
  const { data: champions } = useApi(() => api.getChampionList())

  const [showForm, setShowForm] = useState(false)
  const [activeTab, setActiveTab] = useState('ranking') // ranking | history | rules
  const [expandedMatch, setExpandedMatch] = useState(null)

  const championNames = useMemo(() => {
    if (!champions) return []
    if (typeof champions[0] === 'string') return champions
    return champions.map(c => c.name)
  }, [champions])

  const playerMap = useMemo(() => {
    const m = {}
    allPlayers?.forEach(p => { m[p.id] = p })
    return m
  }, [allPlayers])

  const handleCreated = () => {
    refetchRankings()
    refetchMatches()
    refetchStats()
  }

  const tabs = [
    { id: 'ranking', label: 'Ranking', icon: Trophy },
    { id: 'history', label: 'Partidas', icon: ScrollText },
    { id: 'rules', label: 'Reglas', icon: Info },
  ]

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Swords size={28} className="text-accent" />
            <h1 className="text-2xl font-bold text-white">1v1 Arena</h1>
          </div>
          <p className="text-sm text-surface-400 mt-1">
            Torneo independiente de duelos 1v1
            {stats && ` · ${stats.total_matches || 0} duelos jugados`}
          </p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm flex items-center gap-2">
            <Plus size={14} /> Nuevo Duelo
          </button>
        )}
      </div>

      {/* Stats bar */}
      {stats && stats.total_matches > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="glass-sm p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.total_matches}</p>
            <p className="text-[10px] text-surface-400 uppercase">Duelos</p>
          </div>
          <div className="glass-sm p-3 text-center">
            <p className="text-2xl font-bold text-white">{stats.total_players}</p>
            <p className="text-[10px] text-surface-400 uppercase">Duelistas</p>
          </div>
          {stats.top_player && (
            <div className="glass-sm p-3 text-center">
              <p className="text-lg font-bold text-gold">{stats.top_player.name}</p>
              <p className="text-[10px] text-surface-400 uppercase">
                Top Elo ({Math.round(stats.top_player.elo)})
              </p>
            </div>
          )}
          {stats.best_streak_player && stats.best_streak_player.best_streak > 1 && (
            <div className="glass-sm p-3 text-center">
              <p className="text-lg font-bold text-red-glow flex items-center justify-center gap-1">
                <Flame size={16} />{stats.best_streak_player.best_streak}
              </p>
              <p className="text-[10px] text-surface-400 uppercase">
                Mejor racha ({stats.best_streak_player.name})
              </p>
            </div>
          )}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <CreateDuelForm
          allPlayers={allPlayers}
          champions={championNames}
          onCreated={handleCreated}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-surface-900/50 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all
              ${activeTab === t.id ? 'bg-surface-800 text-white shadow-sm' : 'text-surface-400 hover:text-surface-200'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* Ranking Tab */}
      {activeTab === 'ranking' && (
        <div className="space-y-3">
          {rLoading ? (
            <div className="text-surface-400 text-center py-16">Loading...</div>
          ) : !rankings || rankings.length === 0 ? (
            <EmptyState icon={Trophy} title="Sin ranking aun"
              description="Crea tu primer duelo 1v1 para empezar el ranking" />
          ) : (
            <div className="glass overflow-hidden">
              <div className="grid grid-cols-[3rem_1fr_5rem_5rem_5rem_5rem_5rem] gap-2 px-5 py-3 border-b border-surface-700/40 text-[11px] font-semibold text-surface-400 uppercase tracking-wider">
                <span>#</span>
                <span>Jugador</span>
                <span className="text-right">Elo</span>
                <span className="text-center">W</span>
                <span className="text-center">L</span>
                <span className="text-center">WR%</span>
                <span className="text-center">Racha</span>
              </div>
              {rankings.map((r, idx) => {
                const wr = r.games > 0 ? Math.round(r.wins / r.games * 100) : 0
                return (
                  <div key={r.player_id}
                    className="grid grid-cols-[3rem_1fr_5rem_5rem_5rem_5rem_5rem] gap-2 px-5 py-3 border-b border-surface-700/20 last:border-0 hover:bg-surface-800/30 transition-colors items-center">
                    <span className={`text-sm font-bold ${idx === 0 ? 'text-gold' : idx === 1 ? 'text-surface-300' : idx === 2 ? 'text-amber-600' : 'text-surface-500'}`}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{r.name}</p>
                      <p className="text-[10px] text-surface-500">{r.lol_name_tag}</p>
                    </div>
                    <span className="text-right text-sm font-mono font-bold text-accent">{Math.round(r.elo)}</span>
                    <span className="text-center text-sm font-mono text-emerald-400">{r.wins}</span>
                    <span className="text-center text-sm font-mono text-red-400">{r.losses}</span>
                    <span className={`text-center text-sm font-mono font-semibold ${wr >= 60 ? 'text-emerald-400' : wr <= 40 ? 'text-red-400' : 'text-surface-300'}`}>
                      {wr}%
                    </span>
                    <span className="text-center">
                      {r.win_streak > 0 ? (
                        <span className="text-sm font-mono text-red-glow flex items-center justify-center gap-0.5">
                          <Flame size={12} />{r.win_streak}
                        </span>
                      ) : (
                        <span className="text-sm text-surface-500">-</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-3">
          {mLoading ? (
            <div className="text-surface-400 text-center py-16">Loading...</div>
          ) : !matches || matches.length === 0 ? (
            <EmptyState icon={ScrollText} title="Sin partidas aun"
              description="Los duelos 1v1 apareceran aqui" />
          ) : (
            matches.map(m => {
              const p1 = playerMap[m.player1_id]
              const p2 = playerMap[m.player2_id]
              const isExpanded = expandedMatch === m.id
              const p1Won = m.winner_id === m.player1_id
              const wc = WIN_CONDITIONS.find(w => w.id === m.win_condition) || WIN_CONDITIONS[0]

              return (
                <div key={m.id} className="glass overflow-hidden">
                  <button onClick={() => setExpandedMatch(isExpanded ? null : m.id)}
                    className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-surface-800/30 transition-colors">
                    <span className="text-xs font-mono text-surface-500 w-8">#{m.id}</span>
                    <span className="text-xs text-surface-400 w-20">{m.timestamp?.slice(0, 10)}</span>

                    <div className="flex-1 flex items-center gap-3 min-w-0">
                      <div className="flex items-center gap-2">
                        {m.champion1 && <ChampionIcon name={m.champion1} size={22} />}
                        <span className={`text-sm font-semibold ${p1Won ? 'text-gold' : 'text-surface-400'}`}>
                          {p1?.name || '?'}
                        </span>
                      </div>
                      <span className="text-surface-600 text-xs">vs</span>
                      <div className="flex items-center gap-2">
                        {m.champion2 && <ChampionIcon name={m.champion2} size={22} />}
                        <span className={`text-sm font-semibold ${!p1Won ? 'text-gold' : 'text-surface-400'}`}>
                          {p2?.name || '?'}
                        </span>
                      </div>
                    </div>

                    <span className="text-[10px] px-2 py-1 rounded-lg bg-surface-800 text-surface-300">
                      {wc.icon} {wc.label}
                    </span>

                    {isExpanded ? <ChevronUp size={14} className="text-surface-500" /> :
                                  <ChevronDown size={14} className="text-surface-500" />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-surface-700/40 p-5 grid grid-cols-2 gap-4 animate-slide-up">
                      {[{ pid: m.player1_id, champ: m.champion1, ban: m.ban1, before: m.elo_before_1, after: m.elo_after_1 },
                        { pid: m.player2_id, champ: m.champion2, ban: m.ban2, before: m.elo_before_2, after: m.elo_after_2 }].map(d => {
                        const won = d.pid === m.winner_id
                        const p = playerMap[d.pid]
                        return (
                          <div key={d.pid} className={`glass-sm p-4 ${won ? 'border border-gold/20' : ''}`}>
                            <div className="flex items-center gap-2 mb-2">
                              {won && <Crown size={14} className="text-gold" />}
                              <span className="text-sm font-bold text-white">{p?.name || '?'}</span>
                            </div>
                            {d.champ && (
                              <div className="flex items-center gap-2 mb-1">
                                <ChampionIcon name={d.champ} size={24} />
                                <span className="text-sm text-surface-300">{d.champ}</span>
                              </div>
                            )}
                            {d.ban && (
                              <p className="text-[10px] text-surface-500">Ban: {d.ban}</p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs font-mono text-surface-400">
                                {Math.round(d.before)} → {Math.round(d.after)}
                              </span>
                              <EloChange delta={Math.round((d.after - d.before) * 100) / 100} size="sm" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === 'rules' && (
        <div className="glass p-6 space-y-6">
          <div className="flex items-center gap-3">
            <Info size={24} className="text-accent" />
            <h2 className="text-xl font-bold text-white">Reglas del Torneo 1v1</h2>
          </div>

          <div className="space-y-4">
            <div className="glass-sm p-4">
              <h3 className="text-sm font-bold text-accent uppercase tracking-wider mb-2 flex items-center gap-2">
                <Target size={16} /> Mapa
              </h3>
              <p className="text-sm text-surface-300">
                Todos los duelos se juegan en el mapa de <span className="text-white font-semibold">ARAM (Howling Abyss)</span>.
              </p>
            </div>

            <div className="glass-sm p-4">
              <h3 className="text-sm font-bold text-accent uppercase tracking-wider mb-2 flex items-center gap-2">
                <Trophy size={16} /> Condiciones de Victoria
              </h3>
              <p className="text-sm text-surface-300 mb-3">
                Gana el primero que consiga <span className="text-white font-semibold">cualquiera</span> de estas condiciones:
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-surface-800/50 rounded-lg px-4 py-2.5">
                  <span className="text-lg">💀</span>
                  <div>
                    <p className="text-sm font-semibold text-white">Primera Muerte</p>
                    <p className="text-xs text-surface-400">Conseguir el primer kill del duelo</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-surface-800/50 rounded-lg px-4 py-2.5">
                  <span className="text-lg">🏰</span>
                  <div>
                    <p className="text-sm font-semibold text-white">Primera Torreta</p>
                    <p className="text-xs text-surface-400">Destruir la primera torreta</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-surface-800/50 rounded-lg px-4 py-2.5">
                  <span className="text-lg">⚔️</span>
                  <div>
                    <p className="text-sm font-semibold text-white">100 Minions</p>
                    <p className="text-xs text-surface-400">Ser el primero en alcanzar 100 CS</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="glass-sm p-4">
              <h3 className="text-sm font-bold text-accent uppercase tracking-wider mb-2 flex items-center gap-2">
                <ShieldIcon size={16} /> Bans
              </h3>
              <p className="text-sm text-surface-300">
                Cada jugador puede banear <span className="text-white font-semibold">1 campeon</span> (opcional).
                Los bans se declaran antes de elegir campeon.
              </p>
            </div>

            <div className="glass-sm p-4">
              <h3 className="text-sm font-bold text-accent uppercase tracking-wider mb-2 flex items-center gap-2">
                <Flame size={16} /> Sistema de Elo
              </h3>
              <p className="text-sm text-surface-300">
                El ranking 1v1 usa un sistema de Elo <span className="text-white font-semibold">independiente</span> de la liga principal
                (K=32). Todos empiezan en <span className="font-mono text-accent">1200</span> Elo.
                Las rachas de victorias se registran automaticamente.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
