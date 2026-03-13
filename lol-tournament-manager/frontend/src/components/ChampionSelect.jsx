import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import ChampionIcon from './ChampionIcon'

/**
 * Searchable champion dropdown with icons.
 * Uses a portal so the dropdown isn't clipped by overflow:hidden parents.
 */
export default function ChampionSelect({ champions, value, onChange, placeholder = 'Select champion...' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const btnRef = useRef(null)
  const dropRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (btnRef.current && btnRef.current.contains(e.target)) return
      if (dropRef.current && dropRef.current.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Calculate position when opening
  const updatePos = useCallback(() => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const dropHeight = 240 // approximate max height of dropdown
    const openUpward = spaceBelow < dropHeight && rect.top > dropHeight

    setPos({
      top: openUpward ? rect.top - Math.min(dropHeight, rect.top - 8) : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      openUpward,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    updatePos()
    // Reposition on scroll/resize
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open, updatePos])

  const filtered = (champions || []).filter(c =>
    c.toLowerCase().includes(search.toLowerCase())
  )

  const handleToggle = () => {
    if (!open) updatePos()
    setOpen(!open)
  }

  const dropdown = open ? createPortal(
    <div
      ref={dropRef}
      className="fixed bg-surface-800 border border-surface-600/50 rounded-xl shadow-2xl overflow-hidden animate-fade-in"
      style={{
        top: pos.top,
        left: pos.left,
        width: pos.width,
        zIndex: 9999,
        maxHeight: 240,
      }}
    >
      <div className="p-2 border-b border-surface-700/40">
        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
          className="w-full bg-surface-700 rounded-lg px-3 py-1.5 text-sm text-white
                     placeholder-surface-400 outline-none"
        />
      </div>
      <ul className="overflow-y-auto" style={{ maxHeight: 192 }}>
        {filtered.length === 0 && (
          <li className="px-3 py-2 text-xs text-surface-400">No results</li>
        )}
        {filtered.map(c => (
          <li
            key={c}
            onClick={() => { onChange(c); setOpen(false); setSearch('') }}
            className={`px-3 py-1.5 text-sm cursor-pointer transition-colors flex items-center gap-2
              ${c === value ? 'bg-accent/20 text-accent' : 'hover:bg-surface-700 text-surface-200'}`}
          >
            <ChampionIcon name={c} size={20} />
            {c}
          </li>
        ))}
      </ul>
    </div>,
    document.body
  ) : null

  return (
    <div className="relative">
      <button
        type="button"
        ref={btnRef}
        onClick={handleToggle}
        className="input-field flex items-center gap-2 text-left text-sm w-full"
      >
        {value && <ChampionIcon name={value} size={20} />}
        <span className={`flex-1 truncate ${value ? 'text-white' : 'text-surface-400'}`}>
          {value || placeholder}
        </span>
        {value ? (
          <X size={14} className="text-surface-400 hover:text-white shrink-0"
             onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false) }} />
        ) : (
          <Search size={14} className="text-surface-400 shrink-0" />
        )}
      </button>
      {dropdown}
    </div>
  )
}
