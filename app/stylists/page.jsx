'use client'
import { useState, useEffect } from 'react'
import { getStylists, upsertStylist, deleteStylist, getBranches, uploadFile, deleteFile } from '@/lib/supabase'
import { Card, Button, Field, Toggle, ImageUploader, EmptyState } from '@/components/ui'

const DAYS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' }
]

const empty = {
  id: null, branch_id: '', name_th: '', nickname_en: '', gender: 'female',
  specialties: [], photo_url: '', weekly_schedule: {}, is_active: true,
}

export default function StylistsPage() {
  const [stylists, setStylists] = useState([])
  const [branches, setBranches] = useState([])
  const [filterBranch, setFilterBranch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)
  const [newTag, setNewTag] = useState('')

  async function refresh() {
    const [s, b] = await Promise.all([getStylists(filterBranch || null), getBranches()])
    setStylists(s); setBranches(b); setLoading(false)
  }

  useEffect(() => { refresh() }, [filterBranch])

  function startNew() {
    setForm({ ...empty, branch_id: branches[0]?.id || '' })
    setShowForm(true)
  }
  function startEdit(s) {
    setForm({
      id: s.id, branch_id: s.branch_id, name_th: s.name_th || '', nickname_en: s.nickname_en || '',
      gender: s.gender || 'female', specialties: s.specialties || [], photo_url: s.photo_url || '',
      weekly_schedule: s.weekly_schedule || {}, is_active: s.is_active !== false,
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.name_th || !form.branch_id) { alert('Name and branch are required'); return }
    setSaving(true)
    try {
      await upsertStylist(form)
      setShowForm(false); setForm({ ...empty }); refresh()
    } catch (e) { alert('Save failed: ' + e.message) }
    setSaving(false)
  }

  async function remove(s) {
    if (!confirm(`Deactivate ${s.name_th}?`)) return
    if (s.photo_url) await deleteFile('stylist_photos', s.photo_url).catch(() => {})
    await deleteStylist(s.id); refresh()
  }

  function toggleDay(day) {
    const cur = form.weekly_schedule[day]
    let next
    if (cur?.off) next = { shift: 'full', start: '10:00', end: '20:00' }
    else if (cur?.shift) next = { off: true }
    else next = { shift: 'full', start: '10:00', end: '20:00' }
    setForm({ ...form, weekly_schedule: { ...form.weekly_schedule, [day]: next } })
  }

  function addTag() {
    if (!newTag.trim()) return
    if (form.specialties.includes(newTag.trim())) return
    setForm({ ...form, specialties: [...form.specialties, newTag.trim()] })
    setNewTag('')
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-rose-500 mb-2">Team</p>
          <h1 className="display text-3xl sm:text-4xl text-ink-800">Stylists</h1>
          <p className="text-sm text-ink-400 mt-1">{stylists.length} stylists across all branches</p>
        </div>
        <Button variant="rose" onClick={startNew} className="self-start sm:self-auto">+ Add Stylist</Button>
      </header>

      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setFilterBranch('')}
          className={`text-xs px-3 py-1.5 rounded-full transition ${!filterBranch ? 'bg-ink-800 text-cream-bg' : 'bg-cream-bg text-ink-500 hover:bg-ink-100'}`}>
          All branches
        </button>
        {branches.map(b => (
          <button key={b.id} onClick={() => setFilterBranch(b.id)}
            className={`text-xs px-3 py-1.5 rounded-full transition ${filterBranch === b.id ? 'bg-ink-800 text-cream-bg' : 'bg-cream-bg text-ink-500 hover:bg-ink-100'}`}>
            {b.name_th}
          </button>
        ))}
      </div>

      {showForm && (
        <Card className="p-6 mb-6">
          <h3 className="display text-xl text-ink-800 mb-5">{form.id ? 'Edit Stylist' : 'New Stylist'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="md:col-span-1">
              <ImageUploader bucket="stylist_photos" folder="" label="Photo"
                value={form.photo_url} height="h-48"
                onUploaded={r => setForm({...form, photo_url: r.url})}
                onCleared={url => { deleteFile('stylist_photos', url); setForm({...form, photo_url: ''}) }} />
            </div>
            <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Name (Thai) *" value={form.name_th} onChange={v => setForm({...form, name_th: v})} />
              <Field label="Nickname (English)" value={form.nickname_en} onChange={v => setForm({...form, nickname_en: v})} />
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Branch *</label>
                <select value={form.branch_id} onChange={e => setForm({...form, branch_id: e.target.value})}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
                  <option value="">— Select —</option>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name_th}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Gender</label>
                <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non-binary">Non-binary</option>
                </select>
              </div>
              <div className="col-span-full">
                <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Specialties</label>
                <div className="flex flex-wrap gap-2 mb-2 min-h-[36px] p-2 bg-cream-bg rounded-lg border border-ink-100">
                  {form.specialties.map(t => (
                    <span key={t} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white text-rose-700 text-xs rounded-full border border-rose-200">
                      {t}
                      <button onClick={() => setForm({...form, specialties: form.specialties.filter(x => x !== t)})}
                        className="text-rose-400 hover:text-rose-700">✕</button>
                    </span>
                  ))}
                  {form.specialties.length === 0 && <span className="text-xs text-ink-300">No specialties added yet</span>}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newTag} onChange={e => setNewTag(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    placeholder="e.g. balayage, perm, men's cut…"
                    className="flex-1 px-3 py-2 text-sm border border-ink-100 rounded-lg focus:border-rose-400" />
                  <Button onClick={addTag} variant="soft" size="md">+ Add</Button>
                </div>
              </div>
              <div className="col-span-full">
                <Toggle label="Active" value={form.is_active} onChange={v => setForm({...form, is_active: v})} />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-ink-100">
            <h4 className="text-xs uppercase tracking-wider text-ink-400 mb-3">Weekly Schedule</h4>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {DAYS.map(d => {
                const day = form.weekly_schedule[d.key] || { off: true }
                const off = day.off === true
                return (
                  <div key={d.key} className="border border-ink-100 rounded-lg p-2 text-center">
                    <p className="text-xs font-medium text-ink-600 mb-1">{d.label}</p>
                    <button onClick={() => toggleDay(d.key)}
                      className={`text-xs w-full py-1 rounded transition mb-1 ${off ? 'bg-ink-50 text-ink-400' : 'bg-emerald-50 text-emerald-700'}`}>
                      {off ? 'Off' : 'On'}
                    </button>
                    {!off && (
                      <div className="space-y-1">
                        <input type="time" value={day.start || '10:00'}
                          onChange={e => setForm({...form, weekly_schedule: { ...form.weekly_schedule, [d.key]: { ...day, start: e.target.value } }})}
                          className="w-full px-1 py-0.5 text-[10px] border border-ink-100 rounded" />
                        <input type="time" value={day.end || '20:00'}
                          onChange={e => setForm({...form, weekly_schedule: { ...form.weekly_schedule, [d.key]: { ...day, end: e.target.value } }})}
                          className="w-full px-1 py-0.5 text-[10px] border border-ink-100 rounded" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex gap-2 mt-6 pt-4 border-t border-ink-100">
            <Button onClick={save} disabled={saving} variant="rose">{saving ? '⏳ Saving…' : '💾 Save'}</Button>
            <Button onClick={() => setShowForm(false)} variant="soft">Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? <p className="text-center text-ink-300 py-12">Loading…</p>
        : stylists.length === 0 ? (
          <EmptyState icon="💇" title="No stylists yet" description="Add your first stylist to the team."
            action={<Button variant="rose" onClick={startNew}>+ Add First Stylist</Button>} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {stylists.map(s => (
              <Card key={s.id} className="overflow-hidden">
                <div className="aspect-[5/4] bg-cream-bg flex items-center justify-center">
                  {s.photo_url ? <img src={s.photo_url} alt={s.name_th} className="w-full h-full object-cover" />
                    : <span className="text-6xl text-ink-200">{s.gender === 'male' ? '👨' : '👩'}</span>}
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="display text-xl text-ink-800">{s.name_th}</h3>
                      {s.nickname_en && <p className="text-xs text-ink-400 italic">"{s.nickname_en}"</p>}
                    </div>
                    {!s.is_active && <span className="text-xs px-2 py-0.5 bg-ink-50 text-ink-500 rounded-full">Inactive</span>}
                  </div>
                  <p className="text-xs text-rose-600 mt-2">{s.branches?.name_th || ''}</p>
                  {s.specialties?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {s.specialties.slice(0, 4).map(t => (
                        <span key={t} className="text-xs px-2 py-0.5 bg-cream-bg text-ink-600 rounded-full">{t}</span>
                      ))}
                      {s.specialties.length > 4 && <span className="text-xs text-ink-300">+{s.specialties.length - 4}</span>}
                    </div>
                  )}
                  <div className="flex gap-3 mt-4 pt-3 border-t border-ink-50">
                    <button onClick={() => startEdit(s)} className="text-xs text-rose-600 hover:text-rose-800 font-medium">✏️ Edit</button>
                    <button onClick={() => remove(s)} className="text-xs text-ink-400 hover:text-rose-600 ml-auto">🗑️ Deactivate</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
      )}
    </div>
  )
}
