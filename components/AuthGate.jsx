'use client'
import { useState, useEffect } from 'react'

export default function AuthGate({ children }) {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = typeof window !== 'undefined' && sessionStorage.getItem('neko_auth')
    if (saved === 'true') setAuthed(true)
    setChecking(false)
  }, [])

  function login() {
    const correct = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'neko2026'
    if (password === correct) {
      setAuthed(true)
      sessionStorage.setItem('neko_auth', 'true')
    } else { setError('Incorrect password') }
  }

  if (checking) return null
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card-soft rounded-3xl p-10 w-full max-w-sm">
          <div className="text-center mb-8">
            <p className="text-5xl mb-3">🐱</p>
            <h1 className="display text-3xl text-ink-800">Neko Salon</h1>
            <p className="text-xs uppercase tracking-[0.18em] text-ink-300 mt-2">Studio Dashboard</p>
          </div>
          <input
            type="password" value={password} onChange={e => { setPassword(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && login()} placeholder="Password" autoFocus
            className="w-full px-4 py-3 bg-cream-bg border border-ink-100 rounded-xl text-sm focus:border-rose-400 mb-3 transition"
          />
          {error && <p className="text-xs text-rose-600 mb-2">{error}</p>}
          <button onClick={login}
            className="w-full py-3 bg-ink-800 text-cream-bg rounded-xl text-sm font-medium hover:bg-ink-700 transition">
            Enter Studio
          </button>
        </div>
      </div>
    )
  }
  return children
}
