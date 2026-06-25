'use client'
import { useState, useEffect } from 'react'
import {
  getBranches, getBranch, upsertBranch, deleteBranch,
  addBranchAlias, removeBranchAlias,
} from '@/lib/supabase'
import { Card, Button, Field, Toggle, Tabs, EmptyState } from '@/components/ui'

const DAYS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' }
]
const ALIAS_TYPES = ['thai', 'english', 'nickname', 'misspelling', 'landmark']

export default function BranchesPage() {
  const [branches, setBranches] = useState([])
  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('info')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [form, setForm] = useState({})
  const [hours, setHours] = useState({})
  const [config, setConfig] = useState({})
  const [newAlias, setNewAlias] = useState({ alias: '', alias_type: 'thai' })
  const [creating, setCreating] = useState(false)

  useEffect(() => { refresh() }, [])

  async function refresh() {
    const list = await getBranches()
    setBranches(list); setLoading(false)
    if (selected) {
      const fresh = list.find(b => b.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }

  function pick(b) {
    setSelected(b); setTab('info'); setMsg('')
    setForm({
      id: b.id, slug: b.slug || '', name_th: b.name_th || '', name_en: b.name_en || '',
      address_th: b.address_th || '', address_en: b.address_en || '',
      phone: b.phone || '', google_maps_url: b.google_maps_url || '',
      latitude: b.latitude || '', longitude: b.longitude || '',
      is_active: b.is_active !== false,
    })
    setHours(b.opening_hours || {})
    setConfig(b.config || {})
  }

  function startNew() {
    setSelected({ id: null }); setCreating(true); setTab('info'); setMsg('')
    setForm({ id: null, slug: '', name_th: '', name_en: '', address_th: '', address_en: '',
      phone: '', google_maps_url: '', latitude: '', longitude: '', is_active: true })
    setHours({}); setConfig({})
  }

  async function save(section = 'info') {
    setSaving(true); setMsg('')
    try {
      const payload = { ...form }
      if (section === 'hours') payload.opening_hours = hours
      if (section === 'config') payload.config = config
      // always include hours + config so we don't blank them
      payload.opening_hours = hours
      payload.config = config
      const result = await upsertBranch(payload)
      setMsg('✅ Saved')
      await refresh()
      if (result?.id) {
        setSelected(prev => ({ ...prev, id: result.id }))
        setForm(prev => ({ ...prev, id: result.id }))
        setCreating(false)
      }
    } catch (e) { setMsg('❌ ' + e.message) }
    setSaving(false)
  }

  async function handleDelete() {
    if (!confirm(`Deactivate "${selected.name_th}"? It will be hidden from active branches but data is preserved.`)) return
    await deleteBranch(selected.id)
    setSelected(null)
    refresh()
  }

  async function handleAddAlias() {
    if (!newAlias.alias.trim() || !selected?.id) return
    try {
      await addBranchAlias(selected.id, newAlias.alias.trim(), newAlias.alias_type)
      setNewAlias({ alias: '', alias_type: 'thai' })
      const detail = await getBranch(selected.id)
      setSelected(detail)
    } catch (e) { alert('Failed: ' + e.message) }
  }
  async function handleRemoveAlias(id) {
    if (!confirm('Remove this alias?')) return
    await removeBranchAlias(id)
    const detail = await getBranch(selected.id)
    setSelected(detail)
  }

  function toggleDay(day) {
    const cur = hours[day]
    if (cur?.closed) setHours({ ...hours, [day]: { open: '10:00', close: '20:00' } })
    else if (cur?.open) setHours({ ...hours, [day]: { closed: true } })
    else setHours({ ...hours, [day]: { open: '10:00', close: '20:00' } })
  }

  const TABS = [
    { value: 'info', label: '📍 Info' },
    { value: 'hours', label: '🕐 Hours' },
    { value: 'config', label: '⚙️ Policies' },
    { value: 'aliases', label: '🏷️ Aliases' },
  ]

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-end justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-rose-500 mb-2">Locations</p>
          <h1 className="display text-4xl text-ink-800">Branches</h1>
          <p className="text-sm text-ink-400 mt-1">{branches.length} active locations</p>
        </div>
        <Button variant="rose" onClick={startNew}>+ Add Branch</Button>
      </header>

      <div className="flex gap-6">
        <div className="w-72 space-y-2 shrink-0">
          {loading && <p className="text-ink-300 text-center p-4">Loading…</p>}
          {branches.map(b => (
            <button key={b.id} onClick={() => pick(b)}
              className={`w-full text-left p-4 rounded-2xl border transition ${selected?.id === b.id ? 'border-rose-300 bg-rose-50 shadow-sm' : 'border-ink-100 bg-white hover:border-ink-200'}`}>
              <p className="display text-lg text-ink-800">{b.name_th}</p>
              <p className="text-xs text-ink-400 mt-0.5">{b.slug}</p>
              {!b.is_active && <p className="text-xs text-rose-500 mt-1">Inactive</p>}
            </button>
          ))}
          {!loading && branches.length === 0 && (
            <p className="text-sm text-ink-300 text-center p-6">No branches yet</p>
          )}
        </div>

        {selected ? (
          <Card className="flex-1 overflow-hidden">
            <div className="border-b border-ink-100 px-6 pt-5">
              <div className="flex items-start justify-between mb-2">
                <h2 className="display text-2xl text-ink-800">{creating ? 'New Branch' : selected.name_th || '—'}</h2>
                {!creating && (
                  <Button onClick={handleDelete} variant="danger" size="sm">Deactivate</Button>
                )}
              </div>
              <Tabs tabs={TABS} active={tab} onChange={setTab} />
            </div>
            <div className="p-6 max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-thin">
              {msg && <p className="text-sm mb-4 p-2.5 bg-cream-bg rounded-lg">{msg}</p>}

              {tab === 'info' && (
                <div className="grid grid-cols-2 gap-4 max-w-3xl">
                  <Field label="Slug *" value={form.slug} onChange={v => setForm({...form, slug: v})} hint="kebab-case identifier" />
                  <Field label="Name (Thai) *" value={form.name_th} onChange={v => setForm({...form, name_th: v})} />
                  <Field label="Name (English)" value={form.name_en} onChange={v => setForm({...form, name_en: v})} />
                  <Field label="Phone" value={form.phone} onChange={v => setForm({...form, phone: v})} />
                  <div className="col-span-2">
                    <Field label="Address (Thai)" value={form.address_th} onChange={v => setForm({...form, address_th: v})} multiline />
                  </div>
                  <div className="col-span-2">
                    <Field label="Address (English)" value={form.address_en} onChange={v => setForm({...form, address_en: v})} multiline />
                  </div>
                  <Field label="Latitude" value={form.latitude} onChange={v => setForm({...form, latitude: v})} type="number" />
                  <Field label="Longitude" value={form.longitude} onChange={v => setForm({...form, longitude: v})} type="number" />
                  <div className="col-span-2">
                    <Field label="Google Maps URL" value={form.google_maps_url} onChange={v => setForm({...form, google_maps_url: v})} />
                  </div>
                  <div className="col-span-2">
                    <Toggle label="Active" value={form.is_active} onChange={v => setForm({...form, is_active: v})} />
                  </div>
                  <div className="col-span-2">
                    <Button onClick={() => save('info')} disabled={saving} variant="primary">{saving ? '⏳ Saving…' : '💾 Save'}</Button>
                  </div>
                </div>
              )}

              {tab === 'hours' && (
                <div className="space-y-2 max-w-lg">
                  <p className="text-sm text-ink-500 mb-4">Set weekly opening hours. Use 24-hour format.</p>
                  {DAYS.map(d => {
                    const day = hours[d.key] || {}
                    const isClosed = day.closed === true
                    return (
                      <div key={d.key} className="flex items-center gap-3 py-2 border-b border-ink-50">
                        <span className="text-sm text-ink-700 w-12 font-medium">{d.label}</span>
                        <button onClick={() => toggleDay(d.key)}
                          className={`text-xs px-3 py-1 rounded-full transition ${isClosed ? 'bg-ink-100 text-ink-500' : 'bg-emerald-50 text-emerald-700'}`}>
                          {isClosed ? 'Closed' : 'Open'}
                        </button>
                        {!isClosed && (
                          <>
                            <input type="time" value={day.open || '10:00'}
                              onChange={e => setHours({ ...hours, [d.key]: { ...day, open: e.target.value } })}
                              className="px-2 py-1 text-sm border border-ink-100 rounded-lg focus:border-rose-400" />
                            <span className="text-ink-300">—</span>
                            <input type="time" value={day.close || '20:00'}
                              onChange={e => setHours({ ...hours, [d.key]: { ...day, close: e.target.value } })}
                              className="px-2 py-1 text-sm border border-ink-100 rounded-lg focus:border-rose-400" />
                          </>
                        )}
                      </div>
                    )
                  })}
                  <div className="pt-4">
                    <Button onClick={() => save('hours')} disabled={saving}>{saving ? '⏳' : '💾 Save Hours'}</Button>
                  </div>
                </div>
              )}

              {tab === 'config' && (
                <div className="space-y-4 max-w-lg">
                  <p className="text-sm text-ink-500 mb-2">Per-branch policies stored in <code className="text-xs">config</code> JSONB</p>
                  <Field label="Deposit Amount (THB)" type="number" value={config.deposit_amount ?? ''} onChange={v => setConfig({...config, deposit_amount: Number(v)})} />
                  <Field label="Booking Lead Time (hours)" type="number" value={config.booking_lead_hours ?? ''} onChange={v => setConfig({...config, booking_lead_hours: Number(v)})} />
                  <Field label="Cancellation Window (hours)" type="number" value={config.cancellation_window_hours ?? ''} onChange={v => setConfig({...config, cancellation_window_hours: Number(v)})} />
                  <Toggle label="Walk-ins Accepted" value={config.walk_in} onChange={v => setConfig({...config, walk_in: v})} />
                  <Toggle label="Card Payment Accepted" value={config.card_payment} onChange={v => setConfig({...config, card_payment: v})} />
                  <Toggle label="Promptpay Accepted" value={config.promptpay} onChange={v => setConfig({...config, promptpay: v})} />
                  <Field label="Branch Notes (Thai)" multiline value={config.notes_th ?? ''} onChange={v => setConfig({...config, notes_th: v})} />
                  <Button onClick={() => save('config')} disabled={saving}>{saving ? '⏳' : '💾 Save Policies'}</Button>
                </div>
              )}

              {tab === 'aliases' && !creating && (
                <div className="max-w-lg">
                  <p className="text-sm text-ink-500 mb-4">How customers might refer to this branch in chat (helps automatic branch detection).</p>
                  <div className="flex flex-wrap gap-2 mb-5">
                    {(selected.branch_aliases || []).map(a => (
                      <span key={a.id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-700 text-sm rounded-full border border-rose-200">
                        {a.alias} <span className="text-xs text-rose-400">{a.alias_type}</span>
                        <button onClick={() => handleRemoveAlias(a.id)} className="text-rose-400 hover:text-rose-700 text-xs">✕</button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input type="text" value={newAlias.alias} onChange={e => setNewAlias({...newAlias, alias: e.target.value})}
                      onKeyDown={e => e.key === 'Enter' && handleAddAlias()}
                      placeholder="Add new alias…"
                      className="flex-1 px-3 py-2 text-sm border border-ink-100 rounded-lg focus:border-rose-400" />
                    <select value={newAlias.alias_type} onChange={e => setNewAlias({...newAlias, alias_type: e.target.value})}
                      className="px-3 py-2 text-sm border border-ink-100 rounded-lg focus:border-rose-400">
                      {ALIAS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <Button onClick={handleAddAlias} variant="rose">Add</Button>
                  </div>
                </div>
              )}
              {tab === 'aliases' && creating && <p className="text-sm text-ink-400">Save branch info first, then add aliases.</p>}
            </div>
          </Card>
        ) : (
          <div className="flex-1">
            <EmptyState icon="🏠" title="Select a branch"
              description="Pick a location from the list, or add a new one to get started."
              action={<Button variant="rose" onClick={startNew}>+ Add First Branch</Button>} />
          </div>
        )}
      </div>
    </div>
  )
}
