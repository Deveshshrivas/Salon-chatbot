'use client'
import { useState, useEffect } from 'react'
import { getPromotions, getBranches, getServices, upsertPromotion, deletePromotion, uploadFile, deleteFile } from '@/lib/supabase'
import { Card, Button, Field, Toggle, ImageUploader, EmptyState } from '@/components/ui'

const DISCOUNT_TYPES = [
  { value: 'amount',             label: 'Fixed amount' },
  { value: 'percent',            label: 'Percent off' },
  { value: 'combo',              label: 'Bundle / Combo' },
  { value: 'free_with_purchase', label: 'Free add-on' },
]

const empty = {
  id: null, slug: '', title_th: '', title_en: '', description_th: '', service_slug: '',
  discount_type: 'amount', discount_value: '', original_price: '', promo_price: '',
  valid_from: '', valid_until: '',
  image_url: '', before_image_url: '', after_image_url: '', terms_th: '',
  target_branches: [], target_segments: [], is_active: true,
}

export default function PromotionsPage() {
  const [promos, setPromos] = useState([])
  const [branches, setBranches] = useState([])
  const [services, setServices] = useState([])
  const [filterBranch, setFilterBranch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)

  async function refresh() {
    const [p, b, s] = await Promise.all([getPromotions(filterBranch || null), getBranches(), getServices()])
    setPromos(p); setBranches(b); setServices(s); setLoading(false)
  }
  useEffect(() => { refresh() }, [filterBranch])

  function startNew() {
    setForm({ ...empty, target_branches: branches.map(b => b.id) })
    setShowForm(true)
  }
  function startEdit(p) {
    setForm({
      id: p.id, slug: p.slug || '', title_th: p.title_th || '', title_en: p.title_en || '',
      description_th: p.description_th || '', service_slug: p.service_slug || '',
      discount_type: p.discount_type || 'fixed', discount_value: p.discount_value ?? '',
      original_price: (p.original_price ?? p.regular_price) ?? '', promo_price: p.promo_price ?? '',
      valid_from: p.valid_from ? p.valid_from.split('T')[0] : '',
      valid_until: p.valid_until ? p.valid_until.split('T')[0] : '',
      image_url: p.image_url || '', before_image_url: p.before_image_url || '', after_image_url: p.after_image_url || '',
      terms_th: p.terms_th || '', target_branches: p.target_branches || [], target_segments: p.target_segments || [],
      is_active: p.is_active !== false,
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.title_th || form.target_branches.length === 0) { alert('Title and at least one branch required'); return }
    setSaving(true)
    try {
      // Reuse the existing slug when editing; generate a guaranteed non-null one otherwise.
      const slug = (form.id && form.slug)
        ? form.slug
        : (form.title_th.toLowerCase().replace(/[^a-z0-9฀-๿]+/g, '-').replace(/^-|-$/g, '') || 'promo') + '-' + Date.now()
      const payload = {
        ...form,
        slug,
        regular_price: form.original_price,
        valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : null,
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
      }
      await upsertPromotion(payload)
      setShowForm(false); refresh()
    } catch (e) { alert('Save failed: ' + e.message) }
    setSaving(false)
  }

  async function remove(p) {
    if (!confirm(`Permanently deactivate "${p.title_th}"?`)) return
    if (p.image_url) await deleteFile('promo_images', p.image_url).catch(() => {})
    if (p.before_image_url) await deleteFile('promo_images', p.before_image_url).catch(() => {})
    if (p.after_image_url) await deleteFile('promo_images', p.after_image_url).catch(() => {})
    await deletePromotion(p.id); refresh()
  }

  function toggleBranch(id) {
    setForm({
      ...form,
      target_branches: form.target_branches.includes(id)
        ? form.target_branches.filter(x => x !== id)
        : [...form.target_branches, id]
    })
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <header className="flex items-end justify-between mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-rose-500 mb-2">Campaigns</p>
          <h1 className="display text-4xl text-ink-800">Promotions</h1>
          <p className="text-sm text-ink-400 mt-1">{promos.length} promotions</p>
        </div>
        <Button variant="rose" onClick={startNew}>+ Add Promotion</Button>
      </header>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setFilterBranch('')}
          className={`text-xs px-3 py-1.5 rounded-full transition ${!filterBranch ? 'bg-ink-800 text-cream-bg' : 'bg-cream-bg text-ink-500 hover:bg-ink-100'}`}>All branches</button>
        {branches.map(b => (
          <button key={b.id} onClick={() => setFilterBranch(b.id)}
            className={`text-xs px-3 py-1.5 rounded-full transition ${filterBranch === b.id ? 'bg-ink-800 text-cream-bg' : 'bg-cream-bg text-ink-500 hover:bg-ink-100'}`}>
            {b.name_th}
          </button>
        ))}
      </div>

      {showForm && (
        <Card className="p-6 mb-6">
          <h3 className="display text-xl text-ink-800 mb-5">{form.id ? 'Edit Promotion' : 'New Promotion'}</h3>
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-1 space-y-4">
              <ImageUploader bucket="promo_images" label="Poster (single, full promo flyer)" value={form.image_url} height="h-40"
                onUploaded={r => setForm({...form, image_url: r.url})}
                onCleared={url => { deleteFile('promo_images', url); setForm({...form, image_url: ''}) }} />
              <p className="text-xs text-ink-400 -mt-1 leading-snug">
                Result photos (optional): upload <b>one</b> combined Before/After image, or add a separate After photo below for a two-image pair.
              </p>
              <ImageUploader bucket="promo_images" label="Before / Main result image (optional)" value={form.before_image_url} height="h-28"
                onUploaded={r => setForm({...form, before_image_url: r.url})}
                onCleared={url => { deleteFile('promo_images', url); setForm({...form, before_image_url: ''}) }} />
              <ImageUploader bucket="promo_images" label="After image (optional — only if you have two photos)" value={form.after_image_url} height="h-28"
                onUploaded={r => setForm({...form, after_image_url: r.url})}
                onCleared={url => { deleteFile('promo_images', url); setForm({...form, after_image_url: ''}) }} />
            </div>
            <div className="col-span-2 grid grid-cols-2 gap-4">
              <Field label="Title (Thai) *" value={form.title_th} onChange={v => setForm({...form, title_th: v})} />
              <Field label="Title (English)" value={form.title_en} onChange={v => setForm({...form, title_en: v})} />
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Service (optional)</label>
                <select value={form.service_slug} onChange={e => setForm({...form, service_slug: e.target.value})}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
                  <option value="">— Any service —</option>
                  {services.map(s => <option key={s.slug} value={s.slug}>{s.name_th}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Discount Type</label>
                <select value={form.discount_type} onChange={e => setForm({...form, discount_type: e.target.value})}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
                  {DISCOUNT_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <Field label="Original Price (THB)" type="number" value={form.original_price} onChange={v => setForm({...form, original_price: v})} />
              <Field label="Promo Price (THB)" type="number" value={form.promo_price} onChange={v => setForm({...form, promo_price: v})} />
              <Field label="Valid From" type="date" value={form.valid_from} onChange={v => setForm({...form, valid_from: v})} />
              <Field label="Valid Until" type="date" value={form.valid_until} onChange={v => setForm({...form, valid_until: v})} />
              <div className="col-span-2">
                <Field label="Description (Thai)" multiline value={form.description_th} onChange={v => setForm({...form, description_th: v})} />
              </div>
              <div className="col-span-2">
                <Field label="Terms & Conditions (Thai)" multiline value={form.terms_th} onChange={v => setForm({...form, terms_th: v})} />
              </div>
              <div className="col-span-2">
                <label className="text-xs uppercase tracking-wider text-ink-400 mb-2 block">Branches *</label>
                <div className="flex flex-wrap gap-2">
                  {branches.map(b => (
                    <button key={b.id} onClick={() => toggleBranch(b.id)}
                      className={`text-sm px-3 py-1.5 rounded-full transition ${form.target_branches.includes(b.id) ? 'bg-rose-500 text-white' : 'bg-cream-bg text-ink-500 hover:bg-ink-100'}`}>
                      {b.name_th}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <Toggle label="Active" value={form.is_active} onChange={v => setForm({...form, is_active: v})} />
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-6 pt-4 border-t border-ink-100">
            <Button onClick={save} disabled={saving} variant="rose">{saving ? '⏳ Saving…' : '💾 Save'}</Button>
            <Button onClick={() => setShowForm(false)} variant="soft">Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? <p className="text-center text-ink-300 py-12">Loading…</p>
        : promos.length === 0 ? (
          <EmptyState icon="🏷️" title="No promotions yet" description="Create your first time-bound campaign."
            action={<Button variant="rose" onClick={startNew}>+ Add First Promotion</Button>} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {promos.map(p => {
              const expired = p.valid_until && new Date(p.valid_until) < new Date()
              return (
                <Card key={p.id} className="overflow-hidden">
                  {p.image_url ? (
                    <a href={p.image_url} target="_blank" rel="noopener noreferrer" title="Open original">
                      <img src={p.image_url} alt={p.title_th} className="w-full h-44 object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                          const fb = e.currentTarget.nextElementSibling
                          if (fb) fb.style.display = 'flex'
                        }} />
                      <div className="w-full h-44 bg-rose-50 hidden items-center justify-center text-rose-500 text-xs px-3 text-center">
                        ⚠ Image failed to load.<br/>Check bucket public access or re-upload.
                      </div>
                    </a>
                  ) : (
                    <div className="w-full h-32 bg-cream-bg flex items-center justify-center">
                      <span className="text-ink-200 text-3xl">🏷️</span>
                    </div>
                  )}
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="display text-lg text-ink-800 leading-tight">{p.title_th}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${expired ? 'bg-rose-50 text-rose-600' : p.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-ink-50 text-ink-500'}`}>
                        {expired ? 'Expired' : p.is_active ? 'Active' : 'Off'}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 mt-3">
                      <span className="text-2xl font-bold text-rose-600">฿{Number(p.promo_price || 0).toLocaleString()}</span>
                      {(p.original_price ?? p.regular_price) && <span className="text-sm text-ink-300 line-through">฿{Number(p.original_price ?? p.regular_price).toLocaleString()}</span>}
                    </div>
                    {p.services?.name_th && <p className="text-xs text-ink-400 mt-1">For: {p.services.name_th}</p>}
                    {(p.before_image_url || p.after_image_url) && (
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        {p.before_image_url && <img src={p.before_image_url} className="aspect-square object-cover rounded-lg" alt="" />}
                        {p.after_image_url && <img src={p.after_image_url} className="aspect-square object-cover rounded-lg" alt="" />}
                      </div>
                    )}
                    {p.description_th && <p className="text-xs text-ink-500 mt-3">{p.description_th}</p>}
                    {p.valid_until && (
                      <p className={`text-xs mt-2 ${expired ? 'text-rose-500' : 'text-ink-400'}`}>
                        Ends {new Date(p.valid_until).toLocaleDateString()}
                      </p>
                    )}
                    <div className="flex gap-3 mt-4 pt-3 border-t border-ink-50">
                      <button onClick={() => startEdit(p)} className="text-xs text-rose-600 hover:text-rose-800 font-medium">✏️ Edit</button>
                      <button onClick={() => remove(p)} className="text-xs text-ink-400 hover:text-rose-600 ml-auto">🗑️ Delete</button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
      )}
    </div>
  )
}
