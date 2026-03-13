import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

/**
 * Generic modal overlay.
 */
export default function Modal({ open, onClose, title, children, wide = false }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className={`glass p-6 animate-slide-up max-h-[90vh] overflow-y-auto
                       ${wide ? 'w-full max-w-3xl' : 'w-full max-w-lg'}`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-surface-400 hover:text-white transition-colors p-1">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
