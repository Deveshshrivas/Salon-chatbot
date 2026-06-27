'use client'
import { useState, useEffect } from 'react'
import { getEmployees, createEmployee, updateEmployee, deactivateEmployee, getBranches } from '@/lib/supabase'
import { Card, Button, Field, Toggle, EmptyState } from '@/components/ui'

const ROLES = [
  { value: 'super_admin', label: 'Super Admin',  desc: 'Full access to everything' },
  { value: 'admin',       label: 'Admin',         desc: 'Manage all branches + settings' },
  { value: 'manager',     label: 'Manager',       desc: 'Manage assigned branches' },
  { value: 'staff',       label: 'Staff',         desc: 'Reply to customers, view leads' },
  { value: 'read_only',   label: 'Read-only',     desc: 'View only, no editing' },
]
const NOTIFY_CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email',    label: 'Email' },
  { value: 'both',     label: 'Both' },
]

const empty = {
  id: null, name: '', email: '',
  role: 'staff', branch_ids: [],
  notification_channel: 'email',
  is_active: true,
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...empty })
  const [saving, setSaving] = useState(false)

  async function refresh() {
    const [e, b] = await Promise.all([getEmployees(), getBranches()])
    setEmployees(e); setBranches(b); setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  function startNew() { setForm({ ...empty }); setShowForm(true) }
  function startEdit(emp) {
    setForm({
      id: emp.id,
      name: emp.name || '',
      email: emp.email || '',
      role: emp.role || 'staff',
      branch_ids: emp.branch_ids || [],
      notification_channel: emp.notification_channel || 'email',
      is_active: emp.is_active !== false,
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.name || !form.email) { alert('Name and email are required'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        email: form.email,
        role: form.role,
        branch_ids: form.branch_ids,
        notification_channel: form.notification_channel,
        is_active: form.is_active,
      }
      if (form.id) await updateEmployee(form.id, payload)
      else await createEmployee(payload)
      setShowForm(false); refresh()
    } catch (e) { alert('Save failed: ' + e.message) }
    setSaving(false)
  }

  async function remove(emp) {
    if (!confirm(`Deactivate ${emp.name}? They will lose access.`)) return
    await deactivateEmployee(emp.id); refresh()
  }

  function toggleBranch(id) {
    setForm({
      ...form,
      branch_ids: form.branch_ids.includes(id)
        ? form.branch_ids.filter(x => x !== id)
        : [...form.branch_ids, id]
    })
  }

  const roleBadge = role => {
    const map = {
      super_admin: 'bg-rose-100 text-rose-800',
      admin:       'bg-rose-50 text-rose-700',
      manager:     'bg-amber-50 text-amber-700',
      staff:       'bg-emerald-50 text-emerald-700',
      read_only:   'bg-ink-50 text-ink-500',
    }
    return map[role] || 'bg-ink-50 text-ink-500'
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-rose-500 mb-2">Team Admin</p>
          <h1 className="display text-3xl sm:text-4xl text-ink-800">Staff</h1>
          <p className="text-sm text-ink-400 mt-1">{employees.length} active members</p>
        </div>
        <Button variant="rose" onClick={startNew} className="self-start sm:self-auto">+ Add Staff</Button>
      </header>

      {showForm && (
        <Card className="p-6 mb-6">
          <h3 className="display text-xl text-ink-800 mb-5">{form.id ? 'Edit Staff' : 'New Staff Member'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
            <Field label="Name *" value={form.name} onChange={v => setForm({...form, name: v})} placeholder="Somchai" />
            <Field label="Email *" type="email" value={form.email} onChange={v => setForm({...form, email: v})} />
            <div>
              <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Role</label>
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <p className="text-xs text-ink-300 mt-1">{ROLES.find(r => r.value === form.role)?.desc}</p>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-ink-400 mb-1.5 block">Notify via</label>
              <select value={form.notification_channel} onChange={e => setForm({...form, notification_channel: e.target.value})}
                className="w-full px-3 py-2.5 text-sm bg-white border border-ink-100 rounded-lg focus:border-rose-400">
                {NOTIFY_CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="col-span-full">
              <label className="text-xs uppercase tracking-wider text-ink-400 mb-2 block">Assigned Branches</label>
              <div className="flex flex-wrap gap-2">
                {branches.map(b => (
                  <button key={b.id} onClick={() => toggleBranch(b.id)}
                    className={`text-sm px-3 py-1.5 rounded-full transition ${form.branch_ids.includes(b.id) ? 'bg-rose-500 text-white' : 'bg-cream-bg text-ink-500 hover:bg-ink-100'}`}>
                    {b.name_th}
                  </button>
                ))}
              </div>
              <p className="text-xs text-ink-300 mt-2">First selected branch becomes the primary branch.</p>
            </div>
            <div className="col-span-full">
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
        : employees.length === 0 ? (
          <EmptyState icon="👥" title="No staff yet"
            description="Add the first team member to start managing access."
            action={<Button variant="rose" onClick={startNew}>+ Add First Staff</Button>} />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm min-w-[44rem]">
              <thead className="bg-cream-bg">
                <tr>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Name</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Email</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Role</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Branches</th>
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Notify</th>
                  <th className="text-center px-4 py-3 text-xs uppercase tracking-wider text-ink-400 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {employees.map(emp => {
                  const empBranchNames = (emp.branch_ids || [])
                    .map(id => branches.find(b => b.id === id)?.name_th)
                    .filter(Boolean)
                  return (
                    <tr key={emp.id} className="hover:bg-cream-bg/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink-800">{emp.name}</p>
                      </td>
                      <td className="px-4 py-3 text-ink-600 text-xs font-mono">{emp.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${roleBadge(emp.role)}`}>{emp.role}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-600">
                        {empBranchNames.length === 0 ? <span className="text-ink-400">All branches</span>
                          : empBranchNames.slice(0,2).join(', ') + (empBranchNames.length > 2 ? ` +${empBranchNames.length-2}` : '')}
                      </td>
                      <td className="px-4 py-3 text-xs text-ink-500">{emp.notification_channel}</td>
                      <td className="px-4 py-3 text-center">
                        {emp.is_active
                          ? <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">Active</span>
                          : <span className="text-xs px-2 py-0.5 bg-ink-50 text-ink-500 rounded-full">Off</span>}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button onClick={() => startEdit(emp)} className="text-xs text-rose-600 hover:text-rose-800 mr-2">Edit</button>
                        {emp.is_active && (
                          <button onClick={() => remove(emp)} className="text-xs text-ink-400 hover:text-rose-600">Deactivate</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </Card>
      )}
    </div>
  )
}
