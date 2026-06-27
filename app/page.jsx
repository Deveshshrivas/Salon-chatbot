'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getDashboardStats, getActiveConversations, getHandovers, subscribeToConversations } from '@/lib/supabase'
import { Card, StatusPill } from '@/components/ui'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function safeText(v) {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(safeText).filter(Boolean).join(', ')
  try { return JSON.stringify(v) } catch { return String(v) }
}

export default function OverviewPage() {
  const [stats, setStats] = useState({ conversationsToday: 0, activeNow: 0, bookingsToday: 0, leadsToday: 0, handoversActive: 0 })
  const [conversations, setConversations] = useState([])
  const [handovers, setHandovers] = useState([])
  const [loading, setLoading] = useState(true)

  async function refresh() {
    try {
      const [s, c, h] = await Promise.all([getDashboardStats(), getActiveConversations(), getHandovers()])
      setStats(s); setConversations(c.slice(0, 12)); setHandovers(h)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => {
    refresh()
    const sub = subscribeToConversations(refresh)
    const t = setInterval(refresh, 30000)
    return () => { sub.unsubscribe(); clearInterval(t) }
  }, [])

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 sm:mb-10">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-rose-500 mb-2">Studio</p>
          <h1 className="display text-3xl sm:text-4xl text-ink-800">Welcome back ✨</h1>
          <p className="text-sm text-ink-400 mt-1">Here's what's happening across both branches right now.</p>
        </div>
        <button onClick={refresh}
          className="text-sm text-rose-700 hover:text-rose-900 px-4 py-2 rounded-lg border border-rose-200 hover:bg-rose-50 transition self-start sm:self-auto shrink-0">
          ↻ Refresh
        </button>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-8">
        <StatCard label="Conversations Today" value={stats.conversationsToday} accent="rose" />
        <StatCard label="Active Now" value={stats.activeNow} accent="emerald" />
        <StatCard label="Bookings Today" value={stats.bookingsToday} accent="amber" />
        <StatCard label="New Leads" value={stats.leadsToday} accent="blue" />
        <StatCard label="Waiting on Staff" value={stats.handoversActive} accent="rose-deep" />
      </div>

      {handovers.length > 0 && (
        <Card className="p-5 mb-8 border-rose-200 bg-rose-50/40">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-rose-500">●</span>
            <h3 className="font-medium text-ink-800">Customers waiting for staff ({handovers.length})</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            {handovers.map(h => (
              <Link key={h.id} href={`/conversations?id=${h.conversation_id}`}
                className="flex items-center justify-between bg-white rounded-lg px-4 py-3 hover:bg-rose-50 transition border border-rose-100">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-800 truncate">{h.conversations?.customers?.name || 'Customer'}</p>
                  <p className="text-xs text-ink-400">{h.branches?.name_th || h.branches?.slug || 'No branch'} • {h.reason}</p>
                </div>
                <span className="text-xs text-rose-600 shrink-0">{timeAgo(h.started_at)}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-100">
          <h2 className="display text-xl text-ink-800">Recent Conversations</h2>
          <Link href="/conversations" className="text-sm text-rose-600 hover:text-rose-800">View all →</Link>
        </div>
        {loading ? <p className="p-12 text-center text-ink-300">Loading…</p>
          : conversations.length === 0 ? <p className="p-12 text-center text-ink-300">No conversations yet</p>
          : (
          <div className="divide-y divide-ink-50">
            {conversations.map(c => (
              <Link key={c.id} href={`/conversations?id=${c.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-cream-bg transition">
                <span className={`w-2 h-2 rounded-full shrink-0 ${c.status === 'human_handling' ? 'bg-rose-500' : c.status === 'awaiting_human' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-800 truncate">{c._display_name}</span>
                    {c.customers?.is_vip && <span className="text-xs">⭐</span>}
                    {c.branches?.slug && <span className="text-xs bg-cream-bg text-ink-500 px-2 py-0.5 rounded-full">{c.branches.name_th || c.branches.slug}</span>}
                  </div>
                  <p className="text-xs text-ink-400 truncate mt-0.5">{c.pending_question?.field ? `Asking for: ${safeText(c.pending_question.field)}` : 'Idle'}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-ink-400 mb-1">{timeAgo(c.last_inbound_at)}</p>
                  <StatusPill status={c.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function StatCard({ label, value, accent }) {
  const bars = {
    'rose': 'from-rose-200 to-rose-400',
    'emerald': 'from-emerald-200 to-emerald-400',
    'amber': 'from-amber-200 to-amber-400',
    'blue': 'from-blue-200 to-blue-400',
    'rose-deep': 'from-rose-300 to-rose-600',
  }
  return (
    <div className="card-soft rounded-2xl p-5 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${bars[accent]}`} />
      <p className="text-xs uppercase tracking-wider text-ink-400 mb-3">{label}</p>
      <p className="display text-4xl text-ink-800">{value}</p>
    </div>
  )
}
