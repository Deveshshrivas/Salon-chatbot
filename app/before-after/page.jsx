'use client'
import { useState, useEffect } from 'react'
import {
  getMedia, upsertMedia, deleteMedia, getServices, getBranches,
  uploadFile, deleteFile,
} from '@/lib/supabase'
import { Card, Button, Field, ImageUploader, EmptyState } from '@/components/ui'

const MEDIA_TYPES = [
  { value: 'before_after', label: 'Before / After' },
  { value: 'gallery',      label: 'Gallery' },
]
const GENDERS = ['women', 'men', 'unisex']

const empty = {
  id: null, media_type: 'before_after', bucket: 'before_after', storage_path: '',
  service_slug: '', branch_slug: '', gender: 'women',
  style_tag: [], title_th: '', title_en: '', caption_th: '',
  display_order: 0, is_active: true,
  _url: '',
  _after_url: '', after_storage_path: '',
}

// Best-effort: recover the storage path from a public URL so the old file can be
// removed when an After image is replaced/cleared while editing.
function pathFromPublicUrl(u, bucket) {
  if (!u || !bucket) return ''
  const marker = `/storage/v1/object/public/${bucket}/`
  const i = u.indexOf(marker)
  return i === -1 ? '' : u.slice(i + marker.length)
}

export default function BeforeAfterPage() {
  const [media, setMedia] = useState([])
  const [services, setServices] = useState([])
  const [branches, setBranches] = useState([])
  const [filter, setFilter] = useState({ media_type: '', service_slug: '', branch_slug: '', gender: '' })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)
  const [newTag, setNewTag] = useState('')

  async function refresh() {
    setLoading(true)
    const [m1, m2, s, b] = await Promise.all([
      getMedia({ mediaType: 'before_after' }),
      getMedia({ mediaType: 'gallery' }),
      getServices(),
      getBranches(),
    ])
    setMedia([...m1, ...m2]); setServices(s); setBranches(b); setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const filtered = media.filter(m => {
    if (filter.media_type && m.media_type !== filter.media_type) return false
    if (filter.service_slug && m.service_slug !== filter.service_slug) return false
    if (filter.branch_slug && m.branch_slug !== filter.branch_slug) return false
    if (filter.gender && m.gender !== filter.gender) return false
    return true
  })

  function publicUrl(m) {
    if (m?.image_url) return m.image_url
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (!base || !m?.storage_path) return ''
    return `${base}/storage/v1/object/public/${m.storage_bucket}/${m.storage_path}`
  }

  function startNew(type = 'before_after') {
    setForm({ ...empty, media_type: type, bucket: type === 'before_after' ? 'before_after' : 'salon_media' })
    setShowForm(true)
  }
  function startEdit(m) {
    setForm({
      id: m.id, media_type: m.media_type, bucket: m.storage_bucket,
      storage_path: m.storage_path, _url: publicUrl(m),
      _after_url: m.after_url || '',
      after_storage_path: pathFromPublicUrl(m.after_url, m.storage_bucket),
      service_slug: m.service_slug || '', branch_slug: m.branch_slug || '',
      gender: m.gender || 'women', style_tag: m.style_tag || [],
      title_th: m.title_th || '', title_en: m.title_en || '', caption_th: m.caption_th || '',
      display_order: m.display_order || 0, is_active: m.is_active !== false,
    })
    setShowForm(true)
  }

  async function save() {
    if (!form._url || !form.storage_path) { alert('Please upload an image first'); return }
    setSaving(true)
    try {
      // When an After image is supplied, the main image is treated as the Before shot
      // (so the bot gets a complete before_url + after_url pair). With no After image,
      // the main image is a single combined photo and the pair stays null.
      const hasAfter = form.media_type === 'before_after' && !!form._after_url
      await upsertMedia({
        id: form.id, media_type: form.media_type, storage_bucket: form.bucket, image_url: form._url, storage_path: form.storage_path,
        before_url: hasAfter ? form._url : null,
        after_url: hasAfter ? form._after_url : null,
        service_slug: form.service_slug || null, branch_slug: form.branch_slug || null,
        gender: form.gender, style_tag: form.style_tag,
        title_th: form.title_th, title_en: form.title_en, caption_th: form.caption_th,
        display_order: form.display_order, is_active: form.is_active,
      })
      setShowForm(false); setForm({ ...empty }); refresh()
    } catch (e) { alert('Save failed: ' + e.message) }
    setSaving(false)
  }

  async function remove(m) {
    if (!confirm('Delete this image? It will be removed from storage and the library.')) return
    try {
      await deleteFile(m.storage_bucket, m.storage_path).catch(() => {})
      const afterPath = pathFromPublicUrl(m.after_url, m.storage_bucket)
      if (afterPath) await deleteFile(m.storage_bucket, afterPath).catch(() => {})
      await deleteMedia(m.id); refresh()
    } catch (e) { alert('Delete failed: ' + e.message) }
  }

  function addTag() {
    const t = newTag.trim()
    if (!t || form.style_tag.includes(t)) return
    setForm({ ...form, style_tag: [...form.style_tag, t] }); setNewTag('')
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-rose-500 mb-2">Portfolio</p>
          <h1 className="display text-3xl sm:text-4xl text-ink-800">Gallery</h1>
          <p className="text-sm text-ink-400 mt-1">{media.length} images • Before/after and gallery shots</p>
        </div>
        <div className="flex gap-2">
          <Button variant="soft" onClick={() => startNew('gallery')}>+ Gallery</Button>
          <Button variant="rose" onClick={() => startNew('before_after')}>+ Before / After</Button>
        </div>
      </header>

      <div className="flex gap-2 mb-6 flex-wrap items-center">
        <select value={filter.media_type} onChange={e => setFilter({...filter, media_type: e.target.value})}
          className="px-3 py-2 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
          <option value="">All types</option>
          {MEDIA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={filter.branch_slug} onChange={e => setFilter({...filter, branch_slug: e.target.value})}
          className="px-3 py-2 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
          <option value="">All branches</option>
          {branches.map(b => <option key={b.slug} value={b.slug}>{b.name_th}</option>)}
        </select>
        <select value={filter.service_slug} onChange={e => setFilter({...filter, service_slug: e.target.value})}
          className="px-3 py-2 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400 max-w-xs">
          <option value="">All services</option>
          {services.map(s => <option key={s.slug} value={s.slug}>{s.name_th}</option>)}
        </select>
        <select value={filter.gender} onChange={e => setFilter({...filter, gender: e.target.value})}
          className="px-3 py-2 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
          <option value="">All genders</option>
          {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>

      {showForm && (
        <Card className="p-6 mb-6">
          <h3 className="display text-xl text-ink-800 mb-5">
            {form.id ? 'Edit Image' : (form.media_type === 'before_after' ? 'New Before/After' : 'New Gallery Image')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-1 space-y-3">
              <ImageUploader bucket={form.bucket} folder={form.media_type}
                label={form.media_type === 'before_after' ? 'Before / Main image *' : 'Image *'}
                value={form._url} height="h-56"
                onUploaded={r => setForm({...form, _url: r.url, storage_path: r.path, bucket: r.bucket})}
                onCleared={() => { if (form.storage_path) deleteFile(form.bucket, form.storage_path); setForm({...form, _url:'', storage_path:''}) }} />
              {form.media_type === 'before_after' && (
                <>
                  <ImageUploader bucket={form.bucket} folder={form.media_type} label="After image (optional)"
                    value={form._after_url} height="h-56"
                    onUploaded={r => setForm({...form, _after_url: r.url, after_storage_path: r.path, bucket: r.bucket})}
                    onCleared={() => { if (form.after_storage_path) deleteFile(form.bucket, form.after_storage_path); setForm({...form, _after_url:'', after_storage_path:''}) }} />
                  <p className="text-xs text-ink-400 leading-relaxed">
                    Leave After empty for a single combined photo. Add it to send a separate Before + After pair.
                  </p>
                </>
              )}
            </div>
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Type</label>
                <select value={form.media_type} onChange={e => setForm({...form, media_type: e.target.value})}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
                  {MEDIA_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Gender</label>
                <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
                  {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Service</label>
                <select value={form.service_slug} onChange={e => setForm({...form, service_slug: e.target.value})}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
                  <option value="">— Any service —</option>
                  {services.map(s => <option key={s.slug} value={s.slug}>{s.name_th}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Branch</label>
                <select value={form.branch_slug} onChange={e => setForm({...form, branch_slug: e.target.value})}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
                  <option value="">— Both branches —</option>
                  {branches.map(b => <option key={b.slug} value={b.slug}>{b.name_th}</option>)}
                </select>
              </div>
              <Field label="Title (Thai)" value={form.title_th} onChange={v => setForm({...form, title_th: v})} />
              <Field label="Title (English)" value={form.title_en} onChange={v => setForm({...form, title_en: v})} />
              <Field label="Display Order" type="number" value={form.display_order} onChange={v => setForm({...form, display_order: Number(v) || 0})} />
              <div className="col-span-full">
                <Field label="Caption (Thai)" multiline value={form.caption_th} onChange={v => setForm({...form, caption_th: v})} />
              </div>
              <div className="col-span-full">
                <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Style Tags</label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[36px] p-2 bg-cream-bg rounded-lg border border-ink-100">
                  {form.style_tag.map(t => (
                    <span key={t} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white text-rose-700 text-xs rounded-full border border-rose-200">
                      {t}
                      <button onClick={() => setForm({...form, style_tag: form.style_tag.filter(x => x !== t)})}
                        className="text-rose-400 hover:text-rose-700">✕</button>
                    </span>
                  ))}
                  {form.style_tag.length === 0 && <span className="text-xs text-ink-300">No tags yet</span>}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newTag} onChange={e => setNewTag(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    placeholder="e.g. balayage, bob, short, blonde…"
                    className="flex-1 px-3 py-2 text-sm border border-ink-100 rounded-lg focus:border-rose-400" />
                  <Button onClick={addTag} variant="soft" size="md">+ Add</Button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-6 pt-4 border-t border-ink-100">
            <Button onClick={save} disabled={saving || !form._url} variant="rose">{saving ? '⏳ Saving…' : '💾 Save'}</Button>
            <Button onClick={() => setShowForm(false)} variant="soft">Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? <p className="text-center text-ink-300 py-12">Loading…</p>
        : filtered.length === 0 ? (
          <EmptyState icon="🖼️" title="No images yet"
            description="Upload your first before/after or gallery shot to build the portfolio."
            action={<Button variant="rose" onClick={() => startNew('before_after')}>+ Upload First Image</Button>} />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map(m => {
              const url = publicUrl(m)
              return (
                <Card key={m.id} className="overflow-hidden group">
                  <div className="relative aspect-square">
                    {m.after_url ? (
                      <div className="grid grid-cols-2 w-full h-full">
                        <div className="relative">
                          <img src={url} alt="before" className="w-full h-full object-cover" />
                          <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/55 text-white">Before</span>
                        </div>
                        <div className="relative border-l border-white/60">
                          <img src={m.after_url} alt="after" className="w-full h-full object-cover" />
                          <span className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/55 text-white">After</span>
                        </div>
                      </div>
                    ) : (
                      <img src={url} alt={m.title_th || ''} className="w-full h-full object-cover" />
                    )}
                    <div className="absolute top-2 left-2 flex gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.media_type === 'before_after' ? 'bg-rose-500 text-white' : 'bg-ink-800 text-cream-bg'}`}>
                        {m.media_type === 'before_after' ? 'B/A' : 'Gallery'}
                      </span>
                      {m.after_url && <span className="text-xs px-2 py-0.5 rounded-full bg-white/90 text-ink-700">2 images</span>}
                    </div>
                  </div>
                  <div className="p-3">
                    {m.title_th && <p className="text-sm font-medium text-ink-800 truncate">{m.title_th}</p>}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {m.gender && <span className="text-xs text-ink-400">{m.gender}</span>}
                      {m.service_slug && <span className="text-xs text-ink-400">• {m.service_slug}</span>}
                      {m.branch_slug && <span className="text-xs text-rose-600">• {m.branch_slug}</span>}
                    </div>
                    {m.style_tag?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {m.style_tag.slice(0,3).map(t => (
                          <span key={t} className="text-xs px-1.5 py-0.5 bg-cream-bg text-ink-500 rounded">{t}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-3 mt-3 pt-2 border-t border-ink-50">
                      <button onClick={() => startEdit(m)} className="text-xs text-rose-600 hover:text-rose-800">Edit</button>
                      <button onClick={() => remove(m)} className="text-xs text-ink-400 hover:text-rose-600 ml-auto">Delete</button>
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
