'use client'
import { useState, useEffect } from 'react'
import { getServices, upsertService, deleteService } from '@/lib/supabase'
import { Card, Button, Field, Toggle, EmptyState } from '@/components/ui'

const CATEGORIES = ['cut', 'color', 'perm', 'treatment', 'styling', 'extension', 'men', 'kids', 'package', 'other']

const empty = {
  slug: '', category: 'cut', name_th: '', name_en: '', description_th: '',
  duration_minutes: 60, requires_consultation: false,
  nakhon_pathom_price: '', nakhon_pathom_promo_price: '', nakhon_pathom_price_text: '', nakhon_pathom_available: true,
  ladprao_price: '', ladprao_promo_price: '', ladprao_price_text: '', ladprao_available: true,
  display_order: 100, is_active: true,
}

export default function ServicesPage() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const [search, setSearch] = useState('')
  const [editingSlug, setEditingSlug] = useState(null)

  async function refresh() {
    const data = await getServices()
    setServices(data); setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  function startNew() { setForm({ ...empty }); setEditingSlug(null); setShowForm(true) }
  function startEdit(s) {
    setForm({
      ...empty, ...s,
      nakhon_pathom_price: s.nakhon_pathom_price ?? '', nakhon_pathom_promo_price: s.nakhon_pathom_promo_price ?? '',
      ladprao_price: s.ladprao_price ?? '', ladprao_promo_price: s.ladprao_promo_price ?? '',
    })
    setEditingSlug(s.slug); setShowForm(true)
  }

  async function save() {
    if (!form.slug || !form.name_th) { alert('Slug and Thai name are required'); return }
    setSaving(true)
    try { await upsertService(form); setShowForm(false); refresh() }
    catch (e) { alert('Save failed: ' + e.message) }
    setSaving(false)
  }

  async function remove(s) {
    if (!confirm(`Deactivate "${s.name_th}"?`)) return
    await deleteService(s.slug); refresh()
  }

  const filtered = services.filter(s => {
    if (filter && s.category !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.name_th?.toLowerCase().includes(q) && !s.name_en?.toLowerCase().includes(q) && !s.slug?.includes(q)) return false
    }
    return true
  })

  const grouped = filtered.reduce((acc, s) => {
    (acc[s.category] = acc[s.category] || []).push(s); return acc
  }, {})

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-end justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-rose-500 mb-2">Catalog</p>
          <h1 className="display text-4xl text-ink-800">Services</h1>
          <p className="text-sm text-ink-400 mt-1">{services.length} services • {filtered.length} shown</p>
        </div>
        <Button variant="rose" onClick={startNew}>+ Add Service</Button>
      </header>

      <div className="flex gap-2 mb-6 flex-wrap items-center">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Search services…"
          className="px-3 py-2 text-sm bg-white border border-ink-100 rounded-lg w-72 focus:border-rose-400" />
        <button onClick={() => setFilter('')}
          className={`text-xs px-3 py-1.5 rounded-full transition ${!filter ? 'bg-ink-800 text-cream-bg' : 'bg-cream-bg text-ink-500 hover:bg-ink-100'}`}>All</button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setFilter(c)}
            className={`text-xs px-3 py-1.5 rounded-full transition ${filter === c ? 'bg-ink-800 text-cream-bg' : 'bg-cream-bg text-ink-500 hover:bg-ink-100'}`}>{c}</button>
        ))}
      </div>

      {showForm && (
        <Card className="p-6 mb-6">
          <h3 className="display text-xl text-ink-800 mb-5">{editingSlug ? 'Edit Service' : 'New Service'}</h3>
          <div className="grid grid-cols-3 gap-4 max-w-4xl">
            <Field label="Slug *" value={form.slug} onChange={v => setForm({...form, slug: v})} disabled={!!editingSlug}
              hint={editingSlug ? '(immutable after creation)' : 'unique-id-with-dashes'} />
            <Field label="Name (Thai) *" value={form.name_th} onChange={v => setForm({...form, name_th: v})} />
            <Field label="Name (English)" value={form.name_en} onChange={v => setForm({...form, name_en: v})} />
            <div>
              <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Category</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}
                className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <Field label="Duration (min)" type="number" value={form.duration_minutes} onChange={v => setForm({...form, duration_minutes: Number(v) || 0})} />
            <Field label="Display Order" type="number" value={form.display_order} onChange={v => setForm({...form, display_order: Number(v) || 100})} />
            <div className="col-span-3">
              <Field label="Description (Thai)" multiline value={form.description_th} onChange={v => setForm({...form, description_th: v})} />
            </div>

            <div className="col-span-3 mt-2 grid grid-cols-2 gap-6">
              <div className="bg-cream-bg p-4 rounded-xl">
                <p className="text-sm font-medium text-ink-700 mb-3">📍 Nakhon Pathom</p>
                <div className="space-y-3">
                  <Toggle label="Available" value={form.nakhon_pathom_available} onChange={v => setForm({...form, nakhon_pathom_available: v})} />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Price" type="number" value={form.nakhon_pathom_price} onChange={v => setForm({...form, nakhon_pathom_price: v})} />
                    <Field label="Promo Price" type="number" value={form.nakhon_pathom_promo_price} onChange={v => setForm({...form, nakhon_pathom_promo_price: v})} />
                  </div>
                  <Field label="Price Text Override" value={form.nakhon_pathom_price_text} onChange={v => setForm({...form, nakhon_pathom_price_text: v})} hint='e.g. "700-1000" or "Consultation only"' />
                </div>
              </div>
              <div className="bg-cream-bg p-4 rounded-xl">
                <p className="text-sm font-medium text-ink-700 mb-3">📍 Ladprao</p>
                <div className="space-y-3">
                  <Toggle label="Available" value={form.ladprao_available} onChange={v => setForm({...form, ladprao_available: v})} />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Price" type="number" value={form.ladprao_price} onChange={v => setForm({...form, ladprao_price: v})} />
                    <Field label="Promo Price" type="number" value={form.ladprao_promo_price} onChange={v => setForm({...form, ladprao_promo_price: v})} />
                  </div>
                  <Field label="Price Text Override" value={form.ladprao_price_text} onChange={v => setForm({...form, ladprao_price_text: v})} hint='e.g. "700-1000"' />
                </div>
              </div>
            </div>

            <div className="col-span-3 flex items-center gap-6 pt-2">
              <Toggle label="Requires Consultation" value={form.requires_consultation} onChange={v => setForm({...form, requires_consultation: v})} />
              <Toggle label="Active" value={form.is_active} onChange={v => setForm({...form, is_active: v})} />
            </div>
          </div>
          <div className="flex gap-2 mt-6 pt-4 border-t border-ink-100">
            <Button onClick={save} disabled={saving} variant="rose">{saving ? '⏳ Saving…' : '💾 Save'}</Button>
            <Button onClick={() => setShowForm(false)} variant="soft">Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? <p className="text-center text-ink-300 py-12">Loading…</p>
        : filtered.length === 0 ? (
          <EmptyState icon="✂️" title="No services" description="Try a different filter or add a new service."
            action={<Button variant="rose" onClick={startNew}>+ Add First Service</Button>} />
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <h2 className="display text-xl text-ink-700 mb-3 capitalize">{cat} <span className="text-xs text-ink-400">({items.length})</span></h2>
                <Card className="overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-cream-bg">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Service</th>
                        <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Duration</th>
                        <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Nakhon Pathom</th>
                        <th className="text-right px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Ladprao</th>
                        <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-50">
                      {items.map(s => (
                        <tr key={s.slug} className="hover:bg-cream-bg/60">
                          <td className="px-4 py-3">
                            <p className="font-medium text-ink-800">{s.name_th}</p>
                            {s.name_en && <p className="text-xs text-ink-400">{s.name_en}</p>}
                            <p className="text-xs text-ink-300 font-mono mt-0.5">{s.slug}</p>
                          </td>
                          <td className="px-4 py-3 text-right text-ink-500">{s.duration_minutes}m</td>
                          <td className="px-4 py-3 text-right">
                            <PriceCell available={s.nakhon_pathom_available} price={s.nakhon_pathom_price} promo={s.nakhon_pathom_promo_price} text={s.nakhon_pathom_price_text} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <PriceCell available={s.ladprao_available} price={s.ladprao_price} promo={s.ladprao_promo_price} text={s.ladprao_price_text} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            {s.is_active ? <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">Active</span>
                              : <span className="text-xs px-2 py-0.5 bg-ink-50 text-ink-500 rounded-full">Off</span>}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button onClick={() => startEdit(s)} className="text-xs text-rose-600 hover:text-rose-800 mr-2">Edit</button>
                            <button onClick={() => remove(s)} className="text-xs text-ink-400 hover:text-rose-600">Deactivate</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            ))}
          </div>
      )}
    </div>
  )
}

function PriceCell({ available, price, promo, text }) {
  if (!available) return <span className="text-xs text-ink-300">—</span>
  if (text) return <span className="text-xs text-ink-600">{text}</span>
  if (promo) return (
    <span>
      <span className="text-rose-600 font-medium">฿{Number(promo).toLocaleString()}</span>
      {price && <span className="text-xs text-ink-300 line-through ml-1.5">฿{Number(price).toLocaleString()}</span>}
    </span>
  )
  if (price) return <span className="text-ink-700">฿{Number(price).toLocaleString()}</span>
  return <span className="text-xs text-ink-300">—</span>
}
