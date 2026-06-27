'use client'
import { useState, useEffect } from 'react'
import {
  getBookings, getBranches, updateBookingStatus, cancelBooking,
  attachPaymentProof, deleteFile,
} from '@/lib/supabase'
import { Card, Button, StatusPill, ImageUploader, EmptyState, Field } from '@/components/ui'

const STATUSES = ['pending', 'confirmed', 'in_service', 'completed', 'no_show', 'cancelled', 'rescheduled']
const SCOPES = [
  { value: 'today',    label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past',     label: 'Past' },
  { value: 'all',      label: 'All' },
]

function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}
function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function toLocalDateInput(ts) {
  if (!ts) return ''
  const d = new Date(ts); const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().split('T')[0]
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState('today')
  const [filterBranch, setFilterBranch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [showCancel, setShowCancel] = useState(false)
  const [working, setWorking] = useState(false)

  async function refresh() {
    setLoading(true)
    const today = new Date(); today.setHours(0,0,0,0)
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate()+1)

    const filters = {}
    if (filterBranch) filters.branch = filterBranch
    if (filterStatus) filters.status = filterStatus
    if (scope === 'today') {
      filters.dateFrom = today.toISOString()
      filters.dateTo   = tomorrow.toISOString()
    } else if (scope === 'upcoming') {
      filters.dateFrom = today.toISOString()
    } else if (scope === 'past') {
      filters.dateTo = today.toISOString()
    }

    const [b, br] = await Promise.all([getBookings(filters), getBranches()])
    setBookings(b); setBranches(br); setLoading(false)
    if (selected) {
      const fresh = b.find(x => x.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }

  useEffect(() => { refresh() }, [scope, filterBranch, filterStatus])

  const filtered = bookings.filter(b => {
    if (!search) return true
    const q = search.toLowerCase()
    return (b.code || '').toLowerCase().includes(q)
        || (b.customers?.name || '').toLowerCase().includes(q)
        || (b.customers?.phone || '').includes(q)
        || (b.services?.name_th || '').toLowerCase().includes(q)
        || (b.stylists?.name_th || '').toLowerCase().includes(q)
  })

  // Stats for the current view (today)
  const todayBookings = bookings.filter(b => {
    const start = new Date(b.start_at); const today = new Date()
    return start.toDateString() === today.toDateString()
  })
  const stats = {
    today: todayBookings.length,
    pending: bookings.filter(b => b.status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    noShow: bookings.filter(b => b.status === 'no_show').length,
  }

  async function changeStatus(b, status) {
    setWorking(true)
    try { await updateBookingStatus(b.id, status); refresh() }
    catch (e) { alert('Update failed: ' + e.message) }
    setWorking(false)
  }

  async function handleCancel() {
    if (!selected) return
    setWorking(true)
    try {
      await cancelBooking(selected.id, cancelReason || 'staff_cancelled')
      setShowCancel(false); setCancelReason(''); refresh()
    } catch (e) { alert('Cancel failed: ' + e.message) }
    setWorking(false)
  }

  async function handleProofUploaded(r) {
    if (!selected) return
    setWorking(true)
    try { await attachPaymentProof(selected.id, r.url); refresh() }
    catch (e) { alert('Attach failed: ' + e.message) }
    setWorking(false)
  }

  async function clearProof() {
    if (!selected || !selected.payment_proof_url) return
    if (!confirm('Remove payment proof?')) return
    setWorking(true)
    try {
      await deleteFile('payment_proofs', selected.payment_proof_url)
      await attachPaymentProof(selected.id, null)
      refresh()
    } catch (e) { alert('Remove failed: ' + e.message) }
    setWorking(false)
  }

  function exportCSV() {
    const rows = [['Code','Customer','Phone','Branch','Service','Stylist','Start','Status','Deposit','Deposit Status']]
    filtered.forEach(b => rows.push([
      b.code || '', b.customers?.name || '', b.customers?.phone || '',
      b.branches?.name_th || '', b.services?.name_th || '', b.stylists?.name_th || '',
      b.start_at || '', b.status || '', b.deposit_amount || '', b.deposit_status || '',
    ]))
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `bookings_${new Date().toISOString().split('T')[0]}.csv`; a.click()
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-rose-500 mb-2">Appointments</p>
          <h1 className="display text-3xl sm:text-4xl text-ink-800">Bookings</h1>
          <p className="text-sm text-ink-400 mt-1">{filtered.length} {scope === 'all' ? 'total' : scope}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportCSV} variant="soft">📥 Export CSV</Button>
          <Button onClick={refresh} variant="rose">↻ Refresh</Button>
        </div>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard label="Today" value={stats.today} tint="rose" />
        <StatCard label="Pending" value={stats.pending} tint="amber" />
        <StatCard label="Confirmed" value={stats.confirmed} tint="emerald" />
        <StatCard label="No-show" value={stats.noShow} tint="ink" />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search code, customer, service…"
          className="px-3 py-2 text-sm bg-white border border-ink-100 rounded-lg w-full sm:w-72 focus:border-rose-400" />
        <div className="flex gap-1">
          {SCOPES.map(s => (
            <button key={s.value} onClick={() => setScope(s.value)}
              className={`text-xs px-3 py-1.5 rounded-full transition ${scope === s.value ? 'bg-ink-800 text-cream-bg' : 'bg-cream-bg text-ink-500 hover:bg-ink-100'}`}>
              {s.label}
            </button>
          ))}
        </div>
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
          <option value="">All branches</option>
          {branches.map(b => <option key={b.id} value={b.id}>{b.name_th}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
          <option value="">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm min-w-[36rem]">
              <thead className="bg-cream-bg">
                <tr>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Code</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Customer</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Service</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">When</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-ink-300">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-ink-300">
                    No bookings found
                    {scope === 'today' && (
                      <div className="mt-2 text-xs text-ink-400">
                        Tip: bookings for tomorrow or later appear under
                        {' '}<button onClick={() => setScope('upcoming')} className="text-rose-600 underline">Upcoming</button>.
                      </div>
                    )}
                  </td></tr>
                ) : filtered.map(b => (
                  <tr key={b.id} onClick={() => setSelected(b)}
                    className={`cursor-pointer transition ${selected?.id === b.id ? 'bg-rose-50' : 'hover:bg-cream-bg'}`}>
                    <td className="px-4 py-3 font-mono text-xs text-ink-700">{b.code || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-800">{b.customers?.name || '—'}</p>
                      <p className="text-xs text-ink-400">{b.customers?.phone || ''}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-ink-700">{b.services?.name_th || '—'}</p>
                      <p className="text-xs text-ink-400">{b.stylists?.name_th || ''} • {b.branches?.name_th || ''}</p>
                    </td>
                    <td className="px-4 py-3 text-ink-600">{fmtDateTime(b.start_at)}</td>
                    <td className="px-4 py-3"><StatusPill status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-1">
          {!selected ? (
            <EmptyState icon="📅" title="Select a booking" description="Click a row to view details and manage payment proof." />
          ) : (
            <Card className="p-5 lg:sticky lg:top-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-rose-500 mb-1">Booking</p>
                  <h3 className="display text-2xl text-ink-800 font-mono">{selected.code}</h3>
                </div>
                <button onClick={() => setSelected(null)} className="text-ink-300 hover:text-ink-600 text-sm">✕</button>
              </div>

              <div className="space-y-2.5 text-sm pb-4 border-b border-ink-100">
                <DetailRow label="Customer" value={selected.customers?.name} />
                <DetailRow label="Phone" value={selected.customers?.phone} />
                <DetailRow label="Branch" value={selected.branches?.name_th} />
                <DetailRow label="Service" value={selected.services?.name_th} />
                <DetailRow label="Stylist" value={selected.stylists?.name_th} />
                <DetailRow label="Start" value={fmtDateTime(selected.start_at)} />
                <DetailRow label="End" value={fmtDateTime(selected.end_at)} />
                <DetailRow label="Source" value={selected.source} />
                {selected.customer_notes && <DetailRow label="Notes" value={selected.customer_notes} block />}
                {selected.internal_notes && <DetailRow label="Internal" value={selected.internal_notes} block />}
              </div>

              {selected.status !== 'cancelled' && selected.status !== 'completed' && (
                <div className="py-4 border-b border-ink-100">
                  <p className="text-xs uppercase tracking-wider text-ink-400 mb-2">Update status</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.filter(s => s !== 'cancelled' && s !== selected.status).map(s => (
                      <button key={s} onClick={() => changeStatus(selected, s)} disabled={working}
                        className="text-xs px-2.5 py-1 rounded-full bg-cream-bg text-ink-600 hover:bg-rose-50 hover:text-rose-700 transition disabled:opacity-40">
                        → {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="py-4 border-b border-ink-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs uppercase tracking-wider text-ink-400">Deposit</p>
                  <StatusPill status={selected.deposit_status === 'paid' ? 'confirmed' : 'pending'} />
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-ink-800">฿{Number(selected.deposit_amount || 0).toLocaleString()}</span>
                  <span className="text-xs text-ink-400">{selected.deposit_status}</span>
                </div>
                {selected.deposit_payment_ref && (
                  <p className="text-xs text-ink-400 mt-1 font-mono">Ref: {selected.deposit_payment_ref}</p>
                )}
              </div>

              <div className="py-4 border-b border-ink-100">
                <p className="text-xs uppercase tracking-wider text-ink-400 mb-2">Payment Proof</p>
                {selected.payment_proof_url ? (
                  <div>
                    <a href={selected.payment_proof_url} target="_blank" rel="noreferrer">
                      <img src={selected.payment_proof_url} alt="proof" className="w-full max-h-48 object-cover rounded-lg border border-ink-100 hover:opacity-90 transition" />
                    </a>
                    <p className="text-xs text-ink-400 mt-2">Uploaded {fmtDateTime(selected.payment_proof_uploaded_at)}</p>
                    <button onClick={clearProof} className="text-xs text-rose-600 hover:text-rose-800 mt-2">Remove proof</button>
                  </div>
                ) : (
                  <ImageUploader bucket="payment_proofs" folder={selected.code || 'misc'}
                    label="" height="h-32" onUploaded={handleProofUploaded} />
                )}
              </div>

              <div className="pt-4 flex gap-2">
                {selected.status !== 'cancelled' && (
                  <Button variant="danger" size="sm" onClick={() => setShowCancel(true)}>Cancel Booking</Button>
                )}
                {selected.conversation_id && (
                  <a href={`/conversations?id=${selected.conversation_id}`}
                    className="text-xs text-rose-600 hover:text-rose-800 font-medium px-3 py-2 inline-flex items-center">
                    💬 View chat →
                  </a>
                )}
              </div>

              {showCancel && (
                <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
                  <Field label="Cancellation reason" value={cancelReason} onChange={setCancelReason}
                    placeholder="e.g. customer requested" />
                  <div className="flex gap-2 mt-3">
                    <Button onClick={handleCancel} variant="rose" size="sm" disabled={working}>Confirm Cancel</Button>
                    <Button onClick={() => { setShowCancel(false); setCancelReason('') }} variant="soft" size="sm">Back</Button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value, block }) {
  return (
    <div className={block ? '' : 'flex items-baseline gap-3'}>
      <span className="text-xs uppercase tracking-wider text-ink-300 w-16 shrink-0">{label}</span>
      <span className={`text-ink-700 ${block ? 'block mt-0.5' : 'truncate'}`}>{value || '—'}</span>
    </div>
  )
}

function StatCard({ label, value, tint }) {
  const tints = {
    rose: 'from-rose-200 to-rose-400',
    amber: 'from-amber-200 to-amber-400',
    emerald: 'from-emerald-200 to-emerald-400',
    ink: 'from-ink-200 to-ink-400',
  }
  return (
    <div className="card-soft rounded-2xl p-5 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${tints[tint]}`} />
      <p className="text-xs uppercase tracking-wider text-ink-400 mb-2">{label}</p>
      <p className="display text-3xl text-ink-800">{value}</p>
    </div>
  )
}
