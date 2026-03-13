import { useState } from 'react'
import { Settings, Zap, Copy, Check, AlertCircle, Loader2, RefreshCw, Code, Globe, Server, Key, Eye, EyeOff, Info, Shield, Play } from 'lucide-react'
import { useApi } from '../hooks/useApi'
import * as api from '../api/client'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={handleCopy} className="p-1.5 rounded-lg hover:bg-surface-700/50 transition-colors" title="Copy">
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-surface-400" />}
    </button>
  )
}

function StatusBadge({ ok, label }) {
  return (
    <span className={`text-xs font-mono px-2 py-0.5 rounded ${
      ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
    }`}>
      {label}
    </span>
  )
}

export default function TournamentPage() {
  const { data: config, loading: configLoading, refetch: refetchConfig } = useApi(() => api.getTournamentConfig())
  const { data: keyStatus, refetch: refetchKey } = useApi(() => api.getRiotKeyStatus())
  const { data: formula } = useApi(() => api.getEloFormula())

  // Mode tab
  const [activeTab, setActiveTab] = useState('manual') // 'manual' | 'tournament'

  // API Key
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [savingKey, setSavingKey] = useState(false)
  const [testingKey, setTestingKey] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [keyMsg, setKeyMsg] = useState('')
  const [keyError, setKeyError] = useState('')

  // Setup form
  const [callbackUrl, setCallbackUrl] = useState('')
  const [region, setRegion] = useState('EUW')
  const [useStub, setUseStub] = useState(true)
  const [tournamentName, setTournamentName] = useState('Internal League')
  const [settingUp, setSettingUp] = useState(false)
  const [setupError, setSetupError] = useState('')
  const [setupSuccess, setSetupSuccess] = useState('')

  // Code generation
  const [generatingCode, setGeneratingCode] = useState(false)
  const [generatedCode, setGeneratedCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [codeHistory, setCodeHistory] = useState([])

  const hasKey = keyStatus?.has_key
  const isConfigured = config?.configured
  const tournamentAccessOk = testResult?.tournament_stub_ok === true

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return
    setSavingKey(true)
    setKeyMsg('')
    setKeyError('')
    setTestResult(null)
    try {
      const res = await api.setRiotApiKey(apiKeyInput.trim())
      setKeyMsg(`Key saved: ${res.masked}`)
      setApiKeyInput('')
      refetchKey()
    } catch (e) {
      setKeyError(e.message)
    } finally {
      setSavingKey(false)
    }
  }

  const handleTestKey = async () => {
    setTestingKey(true)
    setTestResult(null)
    setKeyError('')
    setKeyMsg('')
    try {
      const res = await api.testRiotKey()
      setTestResult(res)
      if (res.valid && res.tournament_stub_ok) {
        setKeyMsg('Key is valid and has tournament access — you can use Tournament Mode!')
      } else if (res.valid && !res.tournament_stub_ok) {
        setKeyMsg('Key works for Riot API but does NOT have tournament access. Use Manual Mode or request tournament access from Riot.')
      } else {
        setKeyError(res.error || 'Key validation failed')
      }
    } catch (e) {
      setKeyError(e.message)
    } finally {
      setTestingKey(false)
    }
  }

  const handleSetup = async () => {
    if (!callbackUrl) {
      setSetupError('Callback URL is required')
      return
    }
    setSettingUp(true)
    setSetupError('')
    setSetupSuccess('')
    try {
      const res = await api.setupTournament({
        callback_url: callbackUrl,
        region,
        use_stub: useStub,
        tournament_name: tournamentName,
      })
      setSetupSuccess(`Provider #${res.provider_id} + Tournament #${res.tournament_id} created`)
      refetchConfig()
    } catch (e) {
      setSetupError(e.message)
    } finally {
      setSettingUp(false)
    }
  }

  const handleGenerateCode = async () => {
    setGeneratingCode(true)
    setCodeError('')
    setGeneratedCode('')
    try {
      const res = await api.generateTournamentCode({})
      setGeneratedCode(res.code)
      setCodeHistory(prev => [{ code: res.code, time: new Date().toLocaleTimeString() }, ...prev])
    } catch (e) {
      setCodeError(e.message)
    } finally {
      setGeneratingCode(false)
    }
  }

  const REGIONS = ['BR', 'EUNE', 'EUW', 'JP', 'KR', 'LAN', 'LAS', 'NA', 'OCE', 'RU', 'TR']

  if (configLoading) {
    return <div className="flex items-center justify-center h-64 text-surface-400">Loading...</div>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuration & Info</h1>
        <p className="text-sm text-surface-400 mt-1">
          Manage your league mode, API key, and view the Elo v2 formula
        </p>
      </div>

      {/* Mode Tabs */}
      <div className="glass p-1.5 flex gap-1">
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'manual'
              ? 'bg-accent/20 border border-accent/30 text-accent'
              : 'text-surface-400 hover:text-white hover:bg-surface-700/30'
          }`}
        >
          <Play size={16} />
          Manual Mode
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold ml-1">ACTIVE</span>
        </button>
        <button
          onClick={() => setActiveTab('tournament')}
          className={`flex-1 py-3 px-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'tournament'
              ? 'bg-accent/20 border border-accent/30 text-accent'
              : 'text-surface-400 hover:text-white hover:bg-surface-700/30'
          }`}
        >
          <Globe size={16} />
          Tournament API Mode
          {isConfigured && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold ml-1">CONFIGURED</span>}
        </button>
      </div>

      {/* ── MANUAL MODE TAB ── */}
      {activeTab === 'manual' && (
        <>
          <div className="glass p-6 space-y-4 border-emerald-500/20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Play size={20} className="text-emerald-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Manual Mode — No Riot API Needed</h2>
                <p className="text-xs text-surface-400">Create matches, pick winners, and track Elo directly from the app</p>
              </div>
            </div>

            <div className="bg-surface-800/50 rounded-xl p-4 space-y-3">
              <p className="text-xs text-surface-300 leading-relaxed">
                In manual mode, you control everything from the <span className="text-accent font-semibold">Match</span> page:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { step: '1', title: 'Create Teams', desc: 'Select 10 players or use auto-balance to generate fair teams' },
                  { step: '2', title: 'Pick Champions', desc: 'Optionally select champions and bans for each player' },
                  { step: '3', title: 'Play the Game', desc: 'Play your custom game in the LoL client' },
                  { step: '4', title: 'Report Result', desc: 'Select the winner, MVP, and ACE — Elo v2 calculates everything' },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex gap-3 items-start">
                    <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                      {step}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{title}</p>
                      <p className="text-xs text-surface-400">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
              <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-300 leading-relaxed">
                <p className="font-semibold text-blue-200 mb-1">Elo v2 in Manual Mode</p>
                <p>
                  Without Riot API data, the <strong>performance modifier</strong> is 0 (neutral). Elo changes are based on the
                  base formula (K=24 with win expectancy), <strong>activity bonus</strong> (based on how recently a player played),
                  and <strong>award bonuses</strong> (MVP +2, ACE +1). This is still a significant improvement over basic Elo!
                </p>
              </div>
            </div>
          </div>

          {/* What you get vs what you need Tournament API for */}
          <div className="glass p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Manual vs Tournament API</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-surface-800/50 rounded-xl p-4">
                <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Check size={14} /> Manual Mode — You Have This
                </p>
                <ul className="space-y-2 text-xs text-surface-300">
                  {[
                    'Full Elo v2 tracking (K=24, activity, awards)',
                    'Auto-balanced team generation',
                    'Champion picks & bans tracking',
                    'MVP & ACE selection (+2 / +1 Elo)',
                    'Match history with full Elo breakdown',
                    'Power rankings (Elo + activity)',
                    'Head-to-head comparisons (Versus tab)',
                    'Champion stats per player',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-surface-800/50 rounded-xl p-4">
                <p className="text-xs text-yellow-400 font-semibold uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Globe size={14} /> Tournament API — Extra Features
                </p>
                <ul className="space-y-2 text-xs text-surface-300">
                  {[
                    'Auto-import match results from Riot',
                    'KDA, damage, vision, CS, gold stats',
                    'Performance-based Elo modifier (±4)',
                    'Automatic MVP/ACE detection',
                    'Tournament codes for custom games',
                    'Match duration tracking',
                    'Per-player performance scores',
                    'Requires approved Riot project',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-yellow-400 shrink-0 mt-0.5">{i < 7 ? '◇' : '⚠'}</span>
                      <span className={i === 7 ? 'text-yellow-400/80' : ''}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── TOURNAMENT API TAB ── */}
      {activeTab === 'tournament' && (
        <>
          {/* API Key Section */}
          <div className="glass p-5 space-y-4">
            <div className="flex items-center gap-2">
              <Key size={18} className="text-accent" />
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Riot API Key</h2>
              {hasKey && (
                <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                  {keyStatus.masked}
                </span>
              )}
              {!hasKey && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded bg-red-500/15 text-red-400">
                  Not configured
                </span>
              )}
            </div>

            <p className="text-xs text-surface-400 leading-relaxed">
              Paste your Riot API key here. Dev keys expire every 24h — get one at{' '}
              <a href="https://developer.riotgames.com" target="_blank" rel="noopener"
                 className="text-accent underline underline-offset-2">developer.riotgames.com</a>.
              The key is stored in memory only (resets on server restart).
            </p>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  placeholder="RGAPI-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full bg-surface-800 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-white
                             font-mono placeholder:text-surface-600 focus:outline-none focus:border-accent/50 transition-colors pr-10"
                  onKeyDown={e => e.key === 'Enter' && handleSaveKey()}
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <button
                onClick={handleSaveKey}
                disabled={savingKey || !apiKeyInput.trim()}
                className="btn-primary px-5 flex items-center gap-2 disabled:opacity-40"
              >
                {savingKey ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Save
              </button>
            </div>

            {hasKey && (
              <button
                onClick={handleTestKey}
                disabled={testingKey}
                className="btn-ghost border border-surface-600/50 text-xs flex items-center gap-2 disabled:opacity-40"
              >
                {testingKey ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                Test Key Against Riot API
              </button>
            )}

            {keyError && (
              <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 space-y-1">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertCircle size={14} /> {keyError}
                </div>
              </div>
            )}
            {keyMsg && (
              <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                keyMsg.includes('does NOT') || keyMsg.includes('but NOT')
                  ? 'text-yellow-400 bg-yellow-500/10'
                  : 'text-emerald-400 bg-emerald-500/10'
              }`}>
                {keyMsg.includes('does NOT') || keyMsg.includes('but NOT')
                  ? <AlertCircle size={14} />
                  : <Check size={14} />
                }
                {keyMsg}
              </div>
            )}

            {/* Detailed test results */}
            {testResult && (
              <div className="bg-surface-800/50 rounded-lg p-3 text-xs font-mono space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-surface-500 w-36">Platform API:</span>
                  <StatusBadge ok={testResult.platform_ok} label={`${testResult.platform_status} ${testResult.platform_ok ? '— OK' : '— FAIL'}`} />
                </div>
                {testResult.tournament_stub_status !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-surface-500 w-36">Tournament Stub:</span>
                    <StatusBadge ok={testResult.tournament_stub_ok} label={`${testResult.tournament_stub_status} ${testResult.tournament_stub_ok ? '— OK' : '— FAIL'}`} />
                  </div>
                )}
              </div>
            )}

            {/* 403 explanation */}
            {testResult && testResult.platform_ok && !testResult.tournament_stub_ok && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 space-y-3">
                <div className="flex gap-3">
                  <Shield size={18} className="text-yellow-400 shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-yellow-300">Tournament Access Required</p>
                    <p className="text-xs text-yellow-200/80 leading-relaxed">
                      Your API key is valid but doesn't have <strong>tournament endpoint access</strong>.
                      Standard development keys only allow basic API calls (summoner data, match history, etc).
                    </p>
                    <p className="text-xs text-yellow-200/80 leading-relaxed">
                      To use Tournament Mode, you need to:
                    </p>
                    <ol className="text-xs text-yellow-200/80 space-y-1 list-decimal pl-4">
                      <li>Go to <a href="https://developer.riotgames.com" target="_blank" rel="noopener" className="text-accent underline underline-offset-2">developer.riotgames.com</a></li>
                      <li>Register a new project (or use an existing one)</li>
                      <li>Request <strong>tournament-v5</strong> API access for your project</li>
                      <li>Wait for Riot approval (can take a few days)</li>
                    </ol>
                    <div className="pt-2 border-t border-yellow-500/20">
                      <p className="text-xs text-yellow-200/60">
                        In the meantime, <strong className="text-yellow-200">Manual Mode works perfectly</strong> — you get full Elo v2 tracking,
                        auto-balanced teams, MVP/ACE awards, and all match history features. Tournament API only adds auto-import of in-game stats.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Current Status */}
          <div className={`glass p-5 flex items-center gap-4 ${isConfigured ? 'border-emerald-500/20' : 'border-surface-600/20'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isConfigured ? 'bg-emerald-500/20' : 'bg-surface-700/50'
            }`}>
              {isConfigured
                ? <Check size={20} className="text-emerald-400" />
                : <AlertCircle size={20} className="text-surface-500" />
              }
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white">
                {isConfigured ? 'Tournament Configured' : 'Not Configured'}
              </p>
              {isConfigured ? (
                <p className="text-xs text-surface-400">
                  Provider #{config.provider_id} · Tournament #{config.tournament_id} · {config.region} · {config.use_stub ? 'Stub (Testing)' : 'Production'}
                </p>
              ) : (
                <p className="text-xs text-surface-400">
                  Set up a Riot tournament provider to generate tournament codes
                </p>
              )}
            </div>
            {isConfigured && (
              <button onClick={refetchConfig} className="p-2 rounded-lg hover:bg-surface-700/50 transition-colors">
                <RefreshCw size={16} className="text-surface-400" />
              </button>
            )}
          </div>

          {/* Setup Form (only if NOT configured and key has tournament access) */}
          {!isConfigured && (
            <div className="glass p-6 space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <Settings size={18} className="text-accent" />
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Initial Setup</h2>
              </div>

              {(!hasKey || (testResult && !testResult.tournament_stub_ok)) && (
                <div className="bg-surface-800/50 rounded-xl p-4 text-xs text-surface-400">
                  Save and test your API key above first. You need a key with tournament access to proceed.
                </div>
              )}

              <div>
                <label className="text-xs text-surface-400 font-semibold uppercase tracking-wider block mb-1.5">
                  Callback URL
                </label>
                <input
                  type="url"
                  value={callbackUrl}
                  onChange={e => setCallbackUrl(e.target.value)}
                  placeholder="https://your-server.com/api/tournament/callback"
                  className="w-full bg-surface-800 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-white
                             placeholder:text-surface-500 focus:outline-none focus:border-accent/50 transition-colors"
                />
                <p className="text-[10px] text-surface-500 mt-1">
                  Riot POSTs match results here when a tournament game finishes. For local dev use ngrok.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-surface-400 font-semibold uppercase tracking-wider block mb-1.5">Region</label>
                  <select
                    value={region}
                    onChange={e => setRegion(e.target.value)}
                    className="w-full bg-surface-800 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-white
                               focus:outline-none focus:border-accent/50 transition-colors"
                  >
                    {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-surface-400 font-semibold uppercase tracking-wider block mb-1.5">Tournament Name</label>
                  <input
                    type="text"
                    value={tournamentName}
                    onChange={e => setTournamentName(e.target.value)}
                    className="w-full bg-surface-800 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-white
                               focus:outline-none focus:border-accent/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-xs text-surface-400 font-semibold uppercase tracking-wider block mb-1.5">API Mode</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setUseStub(true)}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                        useStub ? 'bg-accent/20 border border-accent/40 text-accent' :
                        'bg-surface-800 border border-surface-700/30 text-surface-400 hover:text-white'
                      }`}
                    >
                      Stub (Test)
                    </button>
                    <button
                      onClick={() => setUseStub(false)}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                        !useStub ? 'bg-red-500/20 border border-red-500/40 text-red-400' :
                        'bg-surface-800 border border-surface-700/30 text-surface-400 hover:text-white'
                      }`}
                    >
                      Production
                    </button>
                  </div>
                </div>
              </div>

              {setupError && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">
                  <AlertCircle size={16} /> {setupError}
                </div>
              )}
              {setupSuccess && (
                <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 rounded-xl px-4 py-3">
                  <Check size={16} /> {setupSuccess}
                </div>
              )}

              <button
                onClick={handleSetup}
                disabled={settingUp || !callbackUrl}
                className="btn-primary flex items-center gap-2 disabled:opacity-40"
              >
                {settingUp ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                Register Provider & Create Tournament
              </button>
            </div>
          )}

          {/* Code Generation (only if configured) */}
          {isConfigured && (
            <div className="glass p-6 space-y-5">
              <div className="flex items-center gap-2 mb-2">
                <Code size={18} className="text-accent" />
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Generate Tournament Code</h2>
              </div>
              <p className="text-xs text-surface-400 leading-relaxed">
                Generate a tournament code, use it in the LoL client custom game lobby.
                When the game finishes, stats are auto-imported.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleGenerateCode}
                  disabled={generatingCode}
                  className="btn-primary flex items-center gap-2 disabled:opacity-40"
                >
                  {generatingCode ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                  Generate Code
                </button>
              </div>
              {codeError && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-3">
                  <AlertCircle size={16} /> {codeError}
                </div>
              )}
              {generatedCode && (
                <div className="bg-surface-800/80 rounded-xl p-4 border border-accent/20">
                  <p className="text-[10px] text-surface-500 uppercase tracking-widest mb-2">Tournament Code</p>
                  <div className="flex items-center gap-3">
                    <code className="text-lg font-mono font-bold text-accent flex-1 break-all select-all">
                      {generatedCode}
                    </code>
                    <CopyButton text={generatedCode} />
                  </div>
                  <p className="text-[10px] text-surface-500 mt-2">
                    Paste in LoL client: Custom Game → Tournament Code
                  </p>
                </div>
              )}
              {codeHistory.length > 0 && (
                <div>
                  <h3 className="text-xs text-surface-400 font-semibold uppercase tracking-wider mb-2">
                    Generated Codes (this session)
                  </h3>
                  <div className="space-y-1.5">
                    {codeHistory.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-surface-800/50 rounded-lg px-3 py-2">
                        <span className="text-[10px] text-surface-500 w-16">{item.time}</span>
                        <code className="text-xs font-mono text-surface-200 flex-1 truncate">{item.code}</code>
                        <CopyButton text={item.code} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Flow diagram */}
          <div className="glass p-6 space-y-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider">How Tournament API Works</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { step: 1, icon: Server, title: 'Setup', desc: 'Register provider + create tournament (one time)' },
                { step: 2, icon: Code, title: 'Generate Code', desc: 'Get a tournament code for your custom game' },
                { step: 3, icon: Zap, title: 'Play Game', desc: 'Use the code in LoL client custom game lobby' },
                { step: 4, icon: Globe, title: 'Auto-Import', desc: 'Riot sends results → stats auto-imported → Elo updated' },
              ].map(({ step, icon: Icon, title, desc }) => (
                <div key={step} className="bg-surface-800/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-accent/20 text-accent text-xs font-bold flex items-center justify-center">
                      {step}
                    </span>
                    <Icon size={16} className="text-surface-400" />
                  </div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="text-xs text-surface-400 mt-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── ELO V2 FORMULA (always visible) ── */}
      {formula && (
        <div className="glass p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Elo v2 Formula</h2>
          <div className="bg-surface-800/50 rounded-xl p-4 font-mono text-sm text-surface-200">
            <p className="text-accent">{formula.formula}</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="bg-surface-800/50 rounded-lg p-3">
              <p className="text-surface-500 uppercase tracking-widest text-[10px]">K-Factor</p>
              <p className="text-white font-mono text-lg">{formula.k_factor}</p>
            </div>
            <div className="bg-surface-800/50 rounded-lg p-3">
              <p className="text-surface-500 uppercase tracking-widest text-[10px]">Clamp</p>
              <p className="text-white font-mono text-lg">{formula.clamp[0]} / +{formula.clamp[1]}</p>
            </div>
            <div className="bg-surface-800/50 rounded-lg p-3">
              <p className="text-surface-500 uppercase tracking-widest text-[10px]">MVP Bonus</p>
              <p className="text-gold font-mono text-lg">+{formula.mvp_bonus}</p>
            </div>
            <div className="bg-surface-800/50 rounded-lg p-3">
              <p className="text-surface-500 uppercase tracking-widest text-[10px]">ACE Bonus</p>
              <p className="text-blue-glow font-mono text-lg">+{formula.ace_bonus}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs text-surface-400 font-semibold uppercase tracking-wider mb-2">Performance Weights</h3>
              <div className="space-y-1.5">
                {Object.entries(formula.performance_weights).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-surface-700 rounded-full overflow-hidden">
                      <div className="h-full bg-accent/60 rounded-full" style={{ width: `${val * 100}%` }} />
                    </div>
                    <span className="text-xs text-surface-300 w-28">{key.replace(/_/g, ' ')}</span>
                    <span className="text-xs font-mono text-surface-400 w-10 text-right">{(val * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-surface-500 mt-2 italic">
                Performance data only available with Tournament API mode
              </p>
            </div>
            <div>
              <h3 className="text-xs text-surface-400 font-semibold uppercase tracking-wider mb-2">Activity Bonus</h3>
              <div className="space-y-1.5">
                {Object.entries(formula.activity_bonus).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between py-1 border-b border-surface-700/30 last:border-0">
                    <span className="text-xs text-surface-300">{key.replace(/_/g, ' ')}</span>
                    <span className={`text-xs font-mono font-semibold ${
                      val.startsWith('+') ? 'text-emerald-400' : val === '0' ? 'text-surface-400' : 'text-red-400'
                    }`}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
