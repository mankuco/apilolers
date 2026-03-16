import { useState } from 'react'
import { Loader2, Search, CheckCircle2, AlertCircle } from 'lucide-react'
import Modal from './Modal'
import * as api from '../api/client'

const TIERS = ['IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER']
const DIVS = ['IV', 'III', 'II', 'I']

export default function AddPlayerModal({ open, onClose, onAdded }) {
  const [name, setName] = useState('')
  const [tag, setTag] = useState('')
  const [tier, setTier] = useState('GOLD')
  const [div, setDiv] = useState('IV')
  const [useAvg, setUseAvg] = useState(false)
  const [lookupStatus, setLookupStatus] = useState(null) // null | 'loading' | 'found' | 'notfound'
  const [lookupData, setLookupData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const reset = () => {
    setName(''); setTag(''); setTier('GOLD'); setDiv('IV')
    setUseAvg(false); setLookupStatus(null); setLookupData(null)
    setLookupMsg(''); setError(null)
  }

  const [lookupMsg, setLookupMsg] = useState('')

  const handleLookup = async () => {
    if (!tag) return
    setLookupStatus('loading')
    setLookupMsg('')
    try {
      const res = await api.riotLookup(tag)
      if (res.found) {
        setLookupStatus('found')
        setLookupData(res.rank)
        // Auto-set tier/div from API
        setTier(res.rank.tier)
        setDiv(res.rank.division || 'IV')
      } else {
        setLookupStatus('notfound')
        setLookupData(null)
        setLookupMsg(res.message || 'Could not reach Riot API')
      }
    } catch (e) {
      setLookupStatus('notfound')
      setLookupMsg(e.message || 'Request failed')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name || !tag) return
    setSaving(true)
    setError(null)
    try {
      const res = await api.addPlayer({
        name,
        lol_name_tag: tag,
        tier,
        division: div,
        use_api: lookupStatus === 'found',
        use_avg_elo: useAvg,
      })
      onAdded?.(res.player)
      reset()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Player">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5 block">
            Real Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex"
            className="input-field"
            required
          />
        </div>

        {/* Riot ID + Lookup */}
        <div>
          <label className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5 block">
            Riot ID
          </label>
          <div className="flex gap-2">
            <input
              value={tag}
              onChange={(e) => { setTag(e.target.value); setLookupStatus(null) }}
              placeholder="Player#EUW"
              className="input-field flex-1"
              required
            />
            <button
              type="button"
              onClick={handleLookup}
              disabled={!tag || lookupStatus === 'loading'}
              className="btn-ghost border border-surface-600/50 flex items-center gap-1.5 shrink-0"
            >
              {lookupStatus === 'loading' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Search size={16} />
              )}
              <span className="hidden sm:inline">Verify</span>
            </button>
          </div>

          {/* Lookup feedback */}
          {lookupStatus === 'found' && lookupData && (
            <div className="mt-2 flex items-center gap-2 text-emerald-400 text-sm">
              <CheckCircle2 size={16} />
              <span>
                Found: {lookupData.tier} {lookupData.division} ({lookupData.lp} LP)
                — Elo {Math.round(lookupData.elo)}
              </span>
            </div>
          )}
          {lookupStatus === 'notfound' && (
            <div className="mt-2 flex items-start gap-2 text-amber-400 text-sm">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{lookupMsg || 'Riot API unavailable'} — set rank manually below</span>
            </div>
          )}
        </div>

        {/* Manual Tier/Division */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5 block">
              Tier
            </label>
            <select value={tier} onChange={(e) => setTier(e.target.value)} className="select-field">
              {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-1.5 block">
              Division
            </label>
            <select value={div} onChange={(e) => setDiv(e.target.value)} className="select-field">
              {DIVS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* Average Elo toggle */}
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={useAvg}
            onChange={(e) => setUseAvg(e.target.checked)}
            className="w-4 h-4 rounded bg-surface-700 border-surface-500 text-accent
                       focus:ring-accent/30 focus:ring-2 cursor-pointer"
          />
          <span className="text-sm text-surface-300 group-hover:text-white transition-colors">
            Start at current tournament average (mid-season join)
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => { reset(); onClose() }} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2">
            {saving && <Loader2 size={16} className="animate-spin" />}
            Add Player
          </button>
        </div>
      </form>
    </Modal>
  )
}
