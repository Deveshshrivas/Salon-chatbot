'use client'
import { useState } from 'react'
import { uploadFile, deleteFile } from '@/lib/supabase'

export function Field({ label, value, onChange, multiline, disabled, type = 'text', placeholder, hint }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">{label}</label>
      {multiline ? (
        <textarea value={value ?? ''} onChange={e => onChange?.(e.target.value)} rows={3} disabled={disabled} placeholder={placeholder}
          className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400 disabled:bg-cream-bg disabled:text-ink-300 transition resize-none" />
      ) : (
        <input type={type} value={value ?? ''} onChange={e => onChange?.(e.target.value)} disabled={disabled} placeholder={placeholder}
          className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400 disabled:bg-cream-bg disabled:text-ink-300 transition" />
      )}
      {hint && <p className="text-xs text-ink-300 mt-1">{hint}</p>}
    </div>
  )
}

export function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer py-1">
      <span onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition ${value ? 'bg-rose-500' : 'bg-ink-100'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
      </span>
      <span className="text-sm text-ink-700">{label}</span>
    </label>
  )
}

export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, className = '', title }) {
  const base = 'rounded-lg font-medium transition focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-sm' }
  const variants = {
    primary: 'bg-ink-800 text-cream-bg hover:bg-ink-700',
    rose: 'bg-rose-500 text-white hover:bg-rose-600',
    ghost: 'bg-transparent text-ink-600 hover:bg-cream-bg',
    soft: 'bg-cream-bg text-ink-700 hover:bg-ink-50 border border-ink-100',
    danger: 'bg-white text-rose-600 border border-rose-200 hover:bg-rose-50',
  }
  return (
    <button type="button" title={title} onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  )
}

export function Card({ children, className = '' }) {
  return <div className={`card-soft rounded-2xl ${className}`}>{children}</div>
}

export function StatusPill({ status }) {
  const map = {
    active_bot:       { label: '🤖 Bot',       cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    awaiting_human:   { label: '⏳ Waiting',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    human_handling:   { label: '👤 Staff',     cls: 'bg-rose-50 text-rose-700 border-rose-200' },
    closed:           { label: '◇ Closed',     cls: 'bg-ink-50 text-ink-500 border-ink-200' },
    pending:          { label: 'Pending',      cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    confirmed:        { label: 'Confirmed',    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    in_service:       { label: 'In service',   cls: 'bg-rose-50 text-rose-700 border-rose-200' },
    completed:        { label: 'Completed',    cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    cancelled:        { label: 'Cancelled',    cls: 'bg-ink-50 text-ink-500 border-ink-200' },
    no_show:          { label: 'No-show',      cls: 'bg-rose-50 text-rose-700 border-rose-200' },
    rescheduled:      { label: 'Rescheduled',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  }
  const m = map[status] || { label: status || '—', cls: 'bg-ink-50 text-ink-500 border-ink-200' }
  return <span className={`inline-flex text-xs px-2 py-0.5 rounded-full border ${m.cls}`}>{m.label}</span>
}

/**
 * ImageUploader — handles upload to Supabase Storage and previews.
 * Calls onUploaded({ url, path, bucket }) once upload completes.
 */
export function ImageUploader({ bucket, folder = '', value, onUploaded, onCleared, label = 'Upload image', accept = 'image/*', height = 'h-32' }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handle(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setUploading(true)
    try {
      const result = await uploadFile(bucket, file, folder)
      onUploaded(result)
    } catch (err) {
      setError(err.message || 'Upload failed')
    }
    setUploading(false)
    e.target.value = ''
  }

  async function clear() {
    if (value && onCleared) onCleared(value)
  }

  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">{label}</label>
      {value ? (
        <div className="relative group">
          <img src={value} alt="" className={`w-full ${height} object-cover rounded-xl border border-ink-100`} />
          <button onClick={clear}
            className="absolute top-2 right-2 w-7 h-7 bg-white/90 backdrop-blur text-rose-600 rounded-full text-xs flex items-center justify-center shadow hover:bg-white">
            ✕
          </button>
        </div>
      ) : (
        <label className={`flex items-center justify-center w-full ${height} border-2 border-dashed border-ink-200 rounded-xl cursor-pointer hover:border-rose-400 hover:bg-rose-50/40 text-xs text-ink-400 hover:text-rose-600 transition`}>
          {uploading ? '⏳ Uploading…' : '📷 Click to select from device'}
          <input type="file" accept={accept} className="hidden" disabled={uploading} onChange={handle} />
        </label>
      )}
      {error && <p className="text-xs text-rose-600 mt-1">{error}</p>}
    </div>
  )
}

export function EmptyState({ icon = '✨', title, description, action }) {
  return (
    <div className="card-soft rounded-2xl py-16 text-center">
      <p className="text-5xl mb-3">{icon}</p>
      <h3 className="display text-xl text-ink-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-ink-400 mb-5">{description}</p>}
      {action}
    </div>
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-ink-100 mb-6 overflow-x-auto scrollbar-thin">
      {tabs.map(t => (
        <button key={t.value} onClick={() => onChange(t.value)}
          className={`px-4 py-2.5 text-sm whitespace-nowrap transition border-b-2 ${active === t.value ? 'border-rose-500 text-ink-800 font-medium' : 'border-transparent text-ink-400 hover:text-ink-600'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
