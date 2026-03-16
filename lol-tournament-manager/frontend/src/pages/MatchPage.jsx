import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Swords, Shuffle, Check, Award, Shield, Loader2, ChevronRight, Zap, Activity, Target } from 'lucide-react'
import TeamPanel from '../components/TeamPanel'
import EloChange from '../components/EloChange'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import { useApi } from '../hooks/useApi'
import * as api from '../api/client'

const STEPS = ['Select Players', 'Balance Teams', 'Draft', 'Resolve']

export default function MatchPage() {
  const navigate = useNavigate()
  const { data: players } = useApi(() => api.getPlayers(true))
  const { data: champions } = useApi(() => api.getChampionList())

  const [step, setStep] = useState(0)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [splits, setSplits] = useState(null)
  const [chosenSplit, setChosenSplit] = useState(null)

  // Draft state
  const [picksBlue, setPicksBlue] = useState(['', '', '', '', ''])
  const [picksRed, setPicksRed] = useState(['', '', '', '', ''])
  const [bansBlue, setBansBlue] = useState(['', '', '', '', ''])
  const [bansRed, setBansRed] = useState(['', '', '', '', ''])

  // Resolve state
  const [winner, setWinner] = useState(null)
  const [mvpId, setMvpId] = useState(null)
  const [aceId, setAceId] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  // Champion list: handle both Data Dragon (objects) and fallback (strings)
  const championNames = useMemo(() => {
    if (!champions) return []
    if (typeof champions[0] === 'string') return champions
    return champions.map(c => c.name)
  }, [champions])

  const togglePlayer = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else if (next.size < 10) next.add(id)
      return next
    })
  }

  const handleGenerate = async () => {
    try {
      const res = await api.generateTeams([...selectedIds])
      setSplits(res)
      setStep(1)
    } catch (e) {
      alert(e.message)
    }
  }

  const handleChooseSplit = (split) => {
    setChosenSplit(split)
    setPicksBlue(['', '', '', '', ''])
    setPicksRed(['', '', '', '', ''])
    setBansBlue(['', '', '', '', ''])
    setBansRed(['', '', '', '', ''])
    setStep(2)
  }

  const winningTeam = useMemo(() => {
    if (!chosenSplit || !winner) return []
    return winner === 'Blue' ? chosenSplit.team_blue : chosenSplit.team_red
  }, [chosenSplit, winner])

  const losingTeam = useMemo(() => {
    if (!chosenSplit || !winner) return []
    return winner === 'Blue' ? chosenSplit.team_red : chosenSplit.team_blue
  }, [chosenSplit, winner])

  const handleSubmit = async () => {
    if (!winner || !mvpId || !aceId) return
    setSubmitting(true)
    try {
      const payload = {
        team_blue: chosenSplit.team_blue.map(p => p.id),
        team_red: chosenSplit.team_red.map(p => p.id),
        picks_blue: picksBlue,
        picks_red: picksRed,
        bans_blue: bansBlue,
        bans_red: bansRed,
        winner,
        mvp_player_id: mvpId,
        ace_player_id: aceId,
      }
      const res = await api.createMatch(payload)
      setResult(res)
    } catch (e) {
      alert(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Result Screen ──────────────────────────────────────────────
  if (result) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
        <div className="text-center py-6">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Match #{result.match_id} Recorded</h1>
          <p className="text-surface-400 mt-1">
            {winner === 'Blue' ? '🔵 Blue' : '🔴 Red'} Team wins!
          </p>
        </div>

        <div className="glass p-6">
          <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider mb-4">Elo Changes (v3)</h2>
          <div className="space-y-3">
            {result.elo_changes.map(ec => (
              <div key={ec.player_id} className="bg-surface-800/50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">{ec.name}</span>
                    {ec.is_mvp && <Badge variant="mvp" size="md" />}
                    {ec.is_ace && <Badge variant="ace" size="md" />}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-surface-400">
                      {Math.round(ec.elo_before)} → {Math.round(ec.elo_after)}
                    </span>
                    <EloChange delta={ec.delta} size="lg" />
                  </div>
                </div>

                {/* Elo Breakdown */}
                <div className="flex flex-wrap gap-3 mt-2">
                  <span className="text-[11px] px-2 py-0.5 rounded bg-surface-700/50 text-surface-300 font-mono">
                    Base: {ec.delta_base > 0 ? '+' : ''}{ec.delta_base?.toFixed(1) || '0.0'}
                  </span>
                  {ec.performance_mod !== 0 && (
                    <span className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                      ec.performance_mod > 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                    }`}>
                      <Target size={10} className="inline mr-1" />
                      Perf: {ec.performance_mod > 0 ? '+' : ''}{ec.performance_mod?.toFixed(1)}
                    </span>
                  )}
                  {ec.k_used && (
                    <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-surface-700/50 text-surface-400">
                      K:{ec.k_used}
                    </span>
                  )}
                  {ec.streak_multiplier && ec.streak_multiplier !== 1 && (
                    <span className="text-[11px] px-2 py-0.5 rounded font-mono bg-orange-500/15 text-orange-400">
                      🔥×{ec.streak_multiplier}
                    </span>
                  )}
                  {ec.award_bonus !== 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-gold/15 text-gold font-mono">
                      <Award size={10} className="inline mr-1" />
                      Award: +{ec.award_bonus?.toFixed(0)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Elo Formula Note */}
        <div className="glass-sm p-4 text-xs text-surface-400 space-y-1">
          <p className="font-semibold text-surface-300">Elo v3 Formula</p>
          <p className="font-mono">delta = clamp(base × contribution × streak + award, -35, +35)</p>
          <p>Dynamic K (40/16/12/24) · Role-based performance · MVP +2 · ACE +1</p>
        </div>

        <div className="flex justify-center gap-3">
          <button
            onClick={() => { setStep(0); setSelectedIds(new Set()); setSplits(null); setChosenSplit(null); setResult(null); setWinner(null); setMvpId(null); setAceId(null) }}
            className="btn-primary"
          >
            <Swords size={16} className="inline mr-1" /> New Match
          </button>
          <button onClick={() => navigate('/ladder')} className="btn-ghost border border-surface-600/50">
            Back to Ladder
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header + Steps */}
      <div>
        <h1 className="text-2xl font-bold text-white">Create Match</h1>
        <div className="flex items-center gap-2 mt-4">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${i === step ? 'bg-accent/20 text-accent' :
                  i < step ? 'bg-emerald-500/15 text-emerald-400' : 'bg-surface-800 text-surface-500'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${i === step ? 'bg-accent text-white' :
                    i < step ? 'bg-emerald-500 text-white' : 'bg-surface-700 text-surface-400'}`}>
                  {i < step ? '✓' : i + 1}
                </span>
                <span className="hidden sm:inline">{s}</span>
              </div>
              {i < STEPS.length - 1 && <ChevronRight size={14} className="text-surface-600" />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 0: Select Players */}
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-surface-400">
            Select exactly <span className="text-white font-semibold">10 players</span> for this session.
            <span className="ml-2 font-mono text-accent">{selectedIds.size}/10</span>
          </p>

          {!players ? (
            <div className="text-surface-400">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {players.map(p => {
                const selected = selectedIds.has(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlayer(p.id)}
                    className={`glass-sm p-4 text-left transition-all duration-200
                      ${selected
                        ? 'border-accent/50 bg-accent/10 shadow-lg shadow-accent/10'
                        : 'hover:border-surface-500/50 hover:bg-surface-800/50'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold
                        ${selected ? 'bg-accent text-white' : 'bg-surface-700 text-surface-400'}`}>
                        {selected ? '✓' : p.name.charAt(0)}
                      </div>
                      <span className="text-sm font-semibold text-white truncate">{p.name}</span>
                    </div>
                    <p className="text-[11px] text-surface-500 truncate">{p.lol_name_tag}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs font-mono text-surface-300">Elo {Math.round(p.tournament_elo)}</p>
                      {(p.win_streak || 0) >= 3 && (
                        <span className="text-[10px] font-mono text-emerald-400">🔥{p.win_streak}W</span>
                      )}
                      {(p.loss_streak || 0) >= 3 && (
                        <span className="text-[10px] font-mono text-red-400">❄️{p.loss_streak}L</span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={selectedIds.size !== 10}
              className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Shuffle size={16} /> Generate Teams
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Balance / Choose Split */}
      {step === 1 && splits && (
        <div className="space-y-6">
          <p className="text-sm text-surface-400">
            Snake Draft recommendation + balanced alternatives. Pick the one you prefer.
          </p>
          {splits.map((s, idx) => (
            <div key={idx} className={`glass p-5 space-y-4 ${s.recommended ? 'border-accent/40 ring-1 ring-accent/20' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {s.recommended ? (
                    <span className="text-sm font-semibold text-accent flex items-center gap-1.5">
                      <Zap size={14} /> Snake Draft
                      <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded-full ml-1">Recommended</span>
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-surface-300">Alternative {idx}</span>
                  )}
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-surface-800 text-surface-300">
                    Elo diff: {s.elo_diff}
                  </span>
                  {s.warning && (
                    <span className="text-[10px] text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                      ⚠️ {s.warning}
                    </span>
                  )}
                </div>
                <button onClick={() => handleChooseSplit(s)} className="btn-primary text-sm py-1.5">
                  Select
                </button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TeamPanel side="blue" players={s.team_blue} avgElo={s.avg_blue_elo} readonly
                           picks={[]} bans={[]} champions={[]} />
                <TeamPanel side="red" players={s.team_red} avgElo={s.avg_red_elo} readonly
                           picks={[]} bans={[]} champions={[]} />
              </div>
            </div>
          ))}
          <button onClick={() => setStep(0)} className="btn-ghost">← Back to selection</button>
        </div>
      )}

      {/* Step 2: Draft */}
      {step === 2 && chosenSplit && (
        <div className="space-y-6">
          <p className="text-sm text-surface-400">Assign champion picks and bans for each team.</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TeamPanel
              side="blue"
              players={chosenSplit.team_blue}
              picks={picksBlue}
              bans={bansBlue}
              avgElo={chosenSplit.avg_blue_elo}
              champions={championNames}
              onPickChange={(i, v) => setPicksBlue(prev => { const n = [...prev]; n[i] = v; return n })}
              onBanChange={(i, v) => setBansBlue(prev => { const n = [...prev]; n[i] = v; return n })}
            />
            <TeamPanel
              side="red"
              players={chosenSplit.team_red}
              picks={picksRed}
              bans={bansRed}
              avgElo={chosenSplit.avg_red_elo}
              champions={championNames}
              onPickChange={(i, v) => setPicksRed(prev => { const n = [...prev]; n[i] = v; return n })}
              onBanChange={(i, v) => setBansRed(prev => { const n = [...prev]; n[i] = v; return n })}
            />
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn-ghost">← Back</button>
            <button onClick={() => setStep(3)} className="btn-primary">
              Continue to Resolve →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Resolve */}
      {step === 3 && chosenSplit && (
        <div className="space-y-6">
          <div className="glass p-5 space-y-4">
            <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wider">Who won?</h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => { setWinner('Blue'); setMvpId(null); setAceId(null) }}
                className={`py-4 rounded-xl text-center font-bold text-lg transition-all duration-200
                  ${winner === 'Blue'
                    ? 'bg-blue-team/30 border-2 border-blue-glow text-blue-glow glow-blue'
                    : 'bg-surface-800 border-2 border-surface-700/40 text-surface-400 hover:border-surface-500'}`}
              >
                🔵 Blue Team
              </button>
              <button
                onClick={() => { setWinner('Red'); setMvpId(null); setAceId(null) }}
                className={`py-4 rounded-xl text-center font-bold text-lg transition-all duration-200
                  ${winner === 'Red'
                    ? 'bg-red-team/30 border-2 border-red-glow text-red-glow glow-red'
                    : 'bg-surface-800 border-2 border-surface-700/40 text-surface-400 hover:border-surface-500'}`}
              >
                🔴 Red Team
              </button>
            </div>
          </div>

          {winner && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-slide-up">
              <div className="glass p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Award size={18} className="text-gold" />
                  <h3 className="text-sm font-semibold text-gold uppercase tracking-wider">
                    MVP (Winner) +2 Elo
                  </h3>
                </div>
                <p className="text-xs text-surface-400">Best performer on the winning side.</p>
                <div className="space-y-2">
                  {winningTeam.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setMvpId(p.id)}
                      className={`w-full text-left px-4 py-2.5 rounded-xl transition-all flex items-center gap-3
                        ${mvpId === p.id
                          ? 'bg-gold/15 border border-gold/40 text-gold'
                          : 'bg-surface-800 border border-surface-700/30 text-surface-300 hover:border-surface-500'}`}
                    >
                      <span className="text-sm font-semibold">{p.name}</span>
                      <span className="text-xs font-mono text-surface-400 ml-auto">{Math.round(p.tournament_elo)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="glass p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Shield size={18} className="text-blue-glow" />
                  <h3 className="text-sm font-semibold text-blue-glow uppercase tracking-wider">
                    ACE (Loser) +1 Elo
                  </h3>
                </div>
                <p className="text-xs text-surface-400">Best performer on losing side.</p>
                <div className="space-y-2">
                  {losingTeam.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setAceId(p.id)}
                      className={`w-full text-left px-4 py-2.5 rounded-xl transition-all flex items-center gap-3
                        ${aceId === p.id
                          ? 'bg-blue-glow/15 border border-blue-glow/40 text-blue-glow'
                          : 'bg-surface-800 border border-surface-700/30 text-surface-300 hover:border-surface-500'}`}
                    >
                      <span className="text-sm font-semibold">{p.name}</span>
                      <span className="text-xs font-mono text-surface-400 ml-auto">{Math.round(p.tournament_elo)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="btn-ghost">← Back to Draft</button>
            <button
              onClick={handleSubmit}
              disabled={!winner || !mvpId || !aceId || submitting}
              className="btn-primary flex items-center gap-2 disabled:opacity-40"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Submit Match
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
