'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, Button } from '@/components/ui'

export default function SettingsPage() {
  const [status, setStatus] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  async function checkHealth() {
    setLoading(true)
    try {
      const tables = ['conversations','customers','bookings','branches','stylists','services','promotions','handover_sessions','employees','salon_media','api_metrics']
      const counts = {}
      await Promise.all(tables.map(async t => {
        try {
          const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
          counts[t] = count ?? 0
        } catch (e) { counts[t] = '—' }
      }))
      const { count: handovers } = await supabase.from('handover_sessions').select('*', { count: 'exact', head: true }).is('ended_at', null)
      setStatus({
        ...counts,
        activeHandovers: handovers ?? 0,
        supabase: 'connected',
        lastCheck: new Date().toLocaleTimeString('en-GB'),
      })
    } catch (e) {
      setStatus({ supabase: 'error', error: e.message, lastCheck: new Date().toLocaleTimeString('en-GB') })
    }
    setLoading(false)
  }

  useEffect(() => {
    checkHealth()
    const t = setInterval(checkHealth, 60000)
    return () => clearInterval(t)
  }, [])

  async function runRpc(name, label) {
    setBusy(name)
    try {
      const { data, error } = await supabase.rpc(name)
      if (error) throw error
      alert(`${label} — done\n\n` + JSON.stringify(data || {}, null, 2))
      checkHealth()
    } catch (e) { alert(`${label} failed: ${e.message}`) }
    setBusy('')
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.22em] text-rose-500 mb-2">System</p>
        <h1 className="display text-4xl text-ink-800">Settings</h1>
        <p className="text-sm text-ink-400 mt-1">Health, maintenance, and connection info.</p>
      </header>

      <Card className="p-5 mb-6 border-rose-200 bg-rose-50/40">
        <div className="flex items-start gap-3">
          <span className="text-rose-500 text-xl">⚠</span>
          <div>
            <h3 className="font-medium text-ink-800 mb-1">Row Level Security disabled</h3>
            <p className="text-sm text-ink-600">
              19 tables in <code className="text-xs">public</code> have RLS off. Anyone with the anon key can read or modify data.
              Plan to enable RLS + policies before going to production. The service-role key used by n8n bypasses RLS, so workflows
              will keep working once enabled — but anon-key access from the browser would need policies first.
            </p>
          </div>
        </div>
      </Card>

      <Section title="🟢 System Status">
        {loading ? <p className="text-ink-300">Checking…</p> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatusRow label="Supabase" value={status.supabase} ok={status.supabase === 'connected'} />
            <StatusRow label="Last check" value={status.lastCheck} />
            <StatusRow label="Active handovers" value={status.activeHandovers} ok={status.activeHandovers === 0} />
            <StatusRow label="Branches" value={status.branches} />
            <StatusRow label="Stylists" value={status.stylists} />
            <StatusRow label="Services" value={status.services} />
            <StatusRow label="Customers" value={status.customers} />
            <StatusRow label="Conversations" value={status.conversations} />
            <StatusRow label="Bookings" value={status.bookings} />
            <StatusRow label="Messages (api logs)" value={status.api_metrics} />
            <StatusRow label="Salon media" value={status.salon_media} />

          </div>
        )}
      </Section>

      <Section title="⚡ Maintenance">
        <div className="space-y-2.5">
          <ActionRow label="Prune api_metrics" desc="Delete metrics older than 30 days"
            busy={busy === 'prune_api_metrics'} onClick={() => runRpc('prune_api_metrics', 'Prune api_metrics')} />

          <ActionRow label="Refresh health" desc="Re-check all table counts"
            busy={loading} onClick={checkHealth} />
        </div>
      </Section>

      <Section title="🔑 Connection">
        <div className="space-y-2.5">
          <InfoRow label="Supabase URL" value={process.env.NEXT_PUBLIC_SUPABASE_URL} />
          <InfoRow label="Anon key set" value={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? '✅' : '❌'} />
          <InfoRow label="n8n Webhook" value={process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL} />
          <InfoRow label="Dashboard token set" value={process.env.NEXT_PUBLIC_DASHBOARD_TOKEN ? '✅' : '❌'} />
          <InfoRow label="Admin password set" value={process.env.NEXT_PUBLIC_ADMIN_PASSWORD ? '✅' : 'default (neko2026)'} />
        </div>
      </Section>

      <Section title="🪣 Storage Buckets">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BucketRow name="salon_media" purpose="Bot-facing media library (price lists, payment QR, etc)" />
          <BucketRow name="promo_images" purpose="Promotion posters + before/after teasers" />
          <BucketRow name="stylist_photos" purpose="Stylist profile photos" />
          <BucketRow name="before_after" purpose="Service before/after gallery" />
          <BucketRow name="chat_uploads" purpose="Staff attachments sent through Inbox" />
          <BucketRow name="payment_proofs" purpose="Booking payment screenshots" />
          <BucketRow name="logos" purpose="Brand assets" />
          <BucketRow name="wa_media" purpose="Inbound WhatsApp media (private)" />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <Card className="p-6 mb-6">
      <h2 className="display text-lg text-ink-800 mb-4">{title}</h2>
      {children}
    </Card>
  )
}

function StatusRow({ label, value, ok }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      {ok !== undefined && <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />}
      <span className="text-xs text-ink-400 flex-1">{label}</span>
      <span className="text-sm font-medium text-ink-800">{typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (value ?? '—')}</span>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-xs text-ink-400 w-40 shrink-0">{label}</span>
      <code className="text-xs bg-cream-bg px-2 py-1 rounded text-ink-600 truncate flex-1">{value || '—'}</code>
    </div>
  )
}

function ActionRow({ label, desc, onClick, busy }) {
  return (
    <button onClick={onClick} disabled={busy}
      className="w-full flex items-center gap-3 p-3 bg-cream-bg rounded-lg hover:bg-rose-50/60 transition text-left disabled:opacity-50">
      <span className="text-sm font-medium text-ink-700 shrink-0">{busy ? '⏳ Running…' : label}</span>
      <span className="text-xs text-ink-400 ml-auto">{desc}</span>
    </button>
  )
}

function BucketRow({ name, purpose }) {
  return (
    <div className="bg-cream-bg rounded-lg p-3">
      <p className="text-sm font-mono text-ink-700">{name}</p>
      <p className="text-xs text-ink-400 mt-0.5">{purpose}</p>
    </div>
  )
}
