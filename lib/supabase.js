import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

if (typeof window !== 'undefined') {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — using placeholder. Check Vercel env vars and redeploy.')
  } else {
    console.log('[supabase] Using project:', url)
  }
}

export const supabase = createClient(url, key)

// ─── Dashboard Webhook (WF-3 router) ─────────────────────────
// Calls the n8n WF-3 webhook directly from the browser.
// n8n does not return CORS headers on this webhook, so use a no-cors simple POST.
// The browser cannot read the response, but the workflow still receives the action.
export async function dashboardAction(action, params = {}, employeeId = null) {
  const token = process.env.NEXT_PUBLIC_DASHBOARD_TOKEN || ''
  const body = JSON.stringify({ action, params, employeeId, token })
  const direct = process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL
  if (!direct) {
    console.warn('[dashboardAction] NEXT_PUBLIC_N8N_WEBHOOK_URL not set')
    return { success: false, error: 'webhook_not_configured' }
  }

  await fetch(direct, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body,
  })

  return { success: true, opaque: true }
}

// ─── Storage Upload ──────────────────────────────────────────
// `bucket` should be one of: salon_media, promo_images, stylist_photos,
// chat_uploads, before_after, payment_proofs, logos
export async function uploadFile(bucket, file, folder = '') {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const stamp = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  const fileName = folder
    ? `${folder.replace(/\/$/,'')}/${stamp}_${rand}.${ext}`
    : `${stamp}_${rand}.${ext}`
  const { data, error } = await supabase.storage.from(bucket).upload(fileName, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path)
  return { url: urlData.publicUrl, path: data.path, bucket }
}

export async function deleteFile(bucket, urlOrPath) {
  if (!urlOrPath) return
  try {
    const path = urlOrPath.includes('/storage/v1/object/public/')
      ? urlOrPath.split(`/storage/v1/object/public/${bucket}/`)[1]
      : urlOrPath
    if (path) await supabase.storage.from(bucket).remove([path])
  } catch (e) { console.error('deleteFile failed', e) }
}

// ─── Conversations ───────────────────────────────────────────
// Toggle: append ?showAll=1 to the URL to bypass the status filter for debugging.
function _showAllConversations() {
  if (typeof window === 'undefined') return false
  try { return new URLSearchParams(window.location.search).get('showAll') === '1' } catch { return false }
}

export async function getActiveConversations() {
  // The customer_identities embed via customer_id was causing a 400 (PostgREST cannot
  // resolve a direct relationship from conversations -> customer_identities because the
  // FK lives on customer_identities -> customers, not conversations -> customer_identities).
  // We now fetch conversations first, then fetch identities in a second query and stitch.
  const SELECT = `
    *,
    branches:branch_id (id, slug, name_th),
    customers:customer_id (id, name, phone, is_vip),
    channel_accounts:channel_account_id (id, channel, external_id, wa_phone_number, branch_id)
  `

  const showAll = _showAllConversations()

  let q = supabase.from('conversations').select(SELECT)
  if (!showAll) q = q.in('status', ['active_bot', 'awaiting_human', 'human_handling'])
  q = q
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .order('created_at',      { ascending: false, nullsFirst: false })
    .limit(150)

  const { data, error } = await q
  if (error) {
    console.error('[getActiveConversations] query failed:', error)
    return []
  }

  console.log(`[getActiveConversations] ${data?.length || 0} rows (showAll=${showAll})`)

  // Diagnostic: if empty and not in showAll mode, show what statuses exist.
  if ((!data || data.length === 0) && !showAll) {
    const peek = await supabase.from('conversations').select('id,status').limit(20)
    if (peek.error) {
      console.error('[getActiveConversations] diagnostic peek failed (likely RLS blocking SELECT):', peek.error)
    } else {
      const statuses = (peek.data || []).reduce((acc, r) => {
        acc[r.status || 'NULL'] = (acc[r.status || 'NULL'] || 0) + 1
        return acc
      }, {})
      console.warn('[getActiveConversations] no rows match active statuses. Status distribution in first 20 rows:', statuses)
      console.warn('[getActiveConversations] Tip: open the page with ?showAll=1 to bypass the status filter.')
    }
    return []
  }

  // Fetch identities for all distinct customer_ids in one query
  const customerIds = [...new Set((data || []).map(c => c.customer_id).filter(Boolean))]
  let identitiesByCustomer = {}
  if (customerIds.length > 0) {
    const { data: idents, error: identErr } = await supabase
      .from('customer_identities')
      .select('id, customer_id, channel, external_id, display_name_on_platform, profile_pic_url, channel_account_id')
      .in('customer_id', customerIds)
    if (identErr) {
      console.warn('[getActiveConversations] could not load customer_identities (continuing without):', identErr)
    } else {
      for (const ident of idents || []) {
        if (!identitiesByCustomer[ident.customer_id]) identitiesByCustomer[ident.customer_id] = []
        identitiesByCustomer[ident.customer_id].push(ident)
      }
    }
  }

  // Attach identities array onto each conversation (same shape the rest of the code expects)
  const enriched = (data || []).map(c => ({
    ...c,
    customer_identities: identitiesByCustomer[c.customer_id] || [],
  }))

  return enriched.map(normaliseConversation)
}

function normaliseConversation(c) {
  const idents = c.customer_identities || []
  const matching = idents.find(i => i.channel_account_id === c.channel_account_id) || idents[0]
  return {
    ...c,
    _identity: matching || null,
    _display_name: c.customers?.name || matching?.display_name_on_platform || 'Customer',
  }
}

// Fetch a page of messages, newest-first from the DB, returned chronologically
// (oldest→newest) for display. Always orders descending so we get the LATEST rows
// (ascending + limit would pin us to the oldest N and the chat would look frozen).
//   - limit:  page size
//   - before: ISO timestamp; fetch messages strictly older than this (scroll-up paging)
export async function getMessages(conversationId, { limit = 50, before = null } = {}) {
  let q = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q
  if (error) { console.error('[getMessages] failed:', error); return [] }
  return (data || []).reverse()
}

export async function clearChatMessages(conversationId) {
  const { error } = await supabase.from('messages').delete().eq('conversation_id', conversationId)
  if (error) throw error
  await supabase.from('conversations')
    .update({ bot_state: {}, pending_question: null, summary_th: null, summary_message_count: 0 })
    .eq('id', conversationId)
}

export async function deleteConversation(conversationId, customerId) {
  await supabase.from('messages').delete().eq('conversation_id', conversationId)
  await supabase.from('handover_sessions').delete().eq('conversation_id', conversationId)
  await supabase.from('bookings').update({ conversation_id: null }).eq('conversation_id', conversationId)
  const { error } = await supabase.from('conversations').delete().eq('id', conversationId)
  if (error) throw error
  if (customerId) {
    const { data: others } = await supabase
      .from('conversations').select('id').eq('customer_id', customerId).limit(1)
    if (!others?.length) {
      await supabase.from('customer_memory').delete().eq('customer_id', customerId)
      await supabase.from('customer_identities').delete().eq('customer_id', customerId)
      await supabase.from('customers').delete().eq('id', customerId)
    }
  }
}

export async function getHandovers() {
  // handover_sessions has no branch_id column — branch lives on conversations.
  // Embed via conversations.branches and customers, then flatten the branch out so
  // existing UI that reads h.branches.name_th continues to work.
  const { data, error } = await supabase
    .from('handover_sessions')
    .select(`
      *,
      conversations:conversation_id (
        id, customer_id, branch_id,
        customers:customer_id (id, name),
        branches:branch_id (id, slug, name_th)
      )
    `)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
  if (error) { console.error('[getHandovers] failed:', error); return [] }
  return (data || []).map(h => ({
    ...h,
    // Pull the branch from the nested conversations.branches so old UI keeps working
    branches: h.conversations?.branches || null,
  }))
}

export async function getHandoverHistory(conversationId) {
  const { data, error } = await supabase
    .from('handover_sessions')
    .select('*, employees:employee_id (id, display_name)')
    .eq('conversation_id', conversationId)
    .order('started_at', { ascending: false })
    .limit(20)
  if (error) console.error('[getHandoverHistory] failed:', error)
  // Map display_name → name for UI compatibility
  return (data || []).map(h => ({
    ...h,
    employees: h.employees ? { ...h.employees, name: h.employees.display_name, nickname: null } : null,
  }))
}

export async function getCustomerWithMemory(customerId) {
  const [c, m] = await Promise.all([
    supabase.from('customers').select('*, preferred_branch:preferred_branch_id (slug, name_th)').eq('id', customerId).single(),
    supabase.from('customer_memory').select('*').eq('customer_id', customerId).maybeSingle(),
  ])
  return { customer: c.data, memory: m.data }
}

function channelAccountExternalId(conv) {
  if (conv?.channel_accounts?.external_id) return conv.channel_accounts.external_id
  const channel = conv?._identity?.channel || conv?.channel_accounts?.channel
  const branchSlug = conv?.branches?.slug
  if (channel === 'messenger') {
    if (branchSlug === 'ladprao') return 'PLACEHOLDER_FB_PAGE_ID_LP'
    if (branchSlug === 'nakhon_pathom') return 'PLACEHOLDER_FB_PAGE_ID_NPT'
  }
  return null
}

// Handover (freeze/resume) fires the WF-3 → WF-2 webhook for the customer-facing
// handover steps (notify the customer, log handover_sessions server-side). But the
// webhook is no-cors fire-and-forget and does NOT reliably flip conversations.status,
// so relying on it alone made takeovers "auto-release": the dashboard re-reads the DB
// a few seconds later, still sees `active_bot`, and reverts the UI. To make takeover
// STICK until the staff explicitly releases, we also write conversations.status
// directly here — RLS is disabled on this project, so the anon key can update it, and
// this is the authoritative source the inbox re-reads. Accepts a conversation object
// (preferred, so we can pass wa_id/phone_number_id/channel) or a bare id.
export async function freezeConversation(conversation, employeeId = null, reason = 'staff_takeover') {
  const conv = typeof conversation === 'string' ? { id: conversation } : (conversation || {})

  // Authoritative: persist the status switch so it survives background reloads.
  const { error: dbErr } = await supabase
    .from('conversations').update({ status: 'human_handling' }).eq('id', conv.id)

  // Best-effort: customer-facing handover via WF-2 (don't fail the takeover if it's down).
  const res = await dashboardAction('freeze', {
    conversation_id: conv.id,
    wa_id: conv._identity?.external_id,
    phone_number_id: channelAccountExternalId(conv),
    channel: conv._identity?.channel || 'whatsapp',
    reason,
    priority: 'normal',
  }, employeeId)

  // Only treat as failure if the DB write itself failed (the webhook is opaque).
  if (dbErr) return { error: dbErr.message || 'freeze_failed' }
  return res || { success: true }
}

export async function resumeConversation(conversation, outcome = 'resolved', notes = null) {
  const conv = typeof conversation === 'string' ? { id: conversation } : (conversation || {})

  // Authoritative: hand the chat back to the bot in the DB.
  const { error: dbErr } = await supabase
    .from('conversations').update({ status: 'active_bot' }).eq('id', conv.id)

  // Best-effort: WF-2 close-out (resolution outcome, customer message).
  const res = await dashboardAction('resume', {
    conversation_id: conv.id,
    wa_id: conv._identity?.external_id,
    phone_number_id: channelAccountExternalId(conv),
    channel: conv._identity?.channel || 'whatsapp',
    resolution_outcome: outcome,
    notes,
  })

  if (dbErr) return { error: dbErr.message || 'resume_failed' }
  return res || { success: true }
}

// ─── Branches ────────────────────────────────────────────────
export async function getBranches() {
  const { data } = await supabase
    .from('branches')
    .select('*, branch_aliases (*)')
    .order('name_th')
  return data || []
}

export async function getBranch(id) {
  const { data } = await supabase
    .from('branches')
    .select('*, branch_aliases (*)')
    .eq('id', id)
    .single()
  return data
}

export async function upsertBranch(payload) {
  const { data, error } = await supabase.rpc('dashboard_upsert_branch', { p_payload: payload })
  if (error) throw error
  return data
}

export async function deleteBranch(id) {
  const { error } = await supabase.rpc('dashboard_delete_branch', { p_id: id })
  if (error) throw error
}

export async function addBranchAlias(branchId, alias, aliasType = 'name', priority = 10) {
  // Rebuilt schema: branch_aliases has columns (alias_th, alias_type, priority, slug, is_active).
  // The dashboard passes `alias` text + an aliasType. We map alias -> alias_th and derive a slug.
  const slug = String(alias).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const { data, error } = await supabase
    .from('branch_aliases')
    .insert({ branch_id: branchId, alias_th: alias, slug: slug || alias, alias_type: aliasType, priority })
    .select().single()
  if (error) throw error
  return data
}

export async function removeBranchAlias(aliasId) {
  const { error } = await supabase.from('branch_aliases').delete().eq('id', aliasId)
  if (error) throw error
}

// ─── Stylists ────────────────────────────────────────────────
export async function getStylists(branchId = null) {
  let q = supabase
    .from('stylists')
    .select('*, branches:branch_id (slug, name_th)')
    .order('name_th')
  if (branchId) q = q.eq('branch_id', branchId)
  const { data } = await q
  return data || []
}

export async function upsertStylist(payload) {
  const { data, error } = await supabase.rpc('dashboard_upsert_stylist', { p_payload: payload })
  if (error) throw error
  return data
}

export async function deleteStylist(id) {
  const { error } = await supabase.rpc('dashboard_delete_stylist', { p_id: id })
  if (error) throw error
}

// ─── Services ────────────────────────────────────────────────
export async function getServices() {
  const { data } = await supabase
    .from('services')
    .select('*')
    .order('display_order')
    .order('name_th')
  return data || []
}

export async function upsertService(payload) {
  const { data, error } = await supabase.rpc('dashboard_upsert_service', { p_payload: payload })
  if (error) throw error
  return data
}

export async function deleteService(slug) {
  const { error } = await supabase.rpc('dashboard_delete_service', { p_slug: slug })
  if (error) throw error
}

// ─── Promotions ──────────────────────────────────────────────
// Promotions has an FK on service_id, not service_slug. We still expose the slug
// (kept in sync by a trigger in the DB) for code that filters by slug elsewhere.
export async function getPromotions(branchId = null) {
  let q = supabase.from('promotions')
    .select('*, services:service_id (id, slug, name_th, name_en)')
    .order('created_at', { ascending: false })
  const { data, error } = await q
  if (error) console.error('[getPromotions] failed:', error)
  let result = data || []
  if (branchId) result = result.filter(p => (p.target_branches || []).includes(branchId))
  return result
}

export async function upsertPromotion(payload) {
  const { data, error } = await supabase.rpc('dashboard_upsert_promotion', { p_payload: payload })
  if (error) throw error
  return data
}

export async function deletePromotion(id) {
  const { error } = await supabase.rpc('dashboard_delete_promotion', { p_id: id })
  if (error) throw error
}

export async function getActivePromotionsForBranch(branchId) {
  const { data } = await supabase.rpc('get_active_promotions', {
    p_branch_id: branchId || null,
  })
  return data || []
}

// ─── Salon Media (before/after, gallery, payment QR) ─────────
export async function getMedia({ mediaType = null, serviceSlug = null, branchSlug = null } = {}) {
  let q = supabase.from('salon_media').select('*').eq('is_active', true).order('display_order')
  if (mediaType)   q = q.eq('media_type', mediaType)
  if (serviceSlug) q = q.eq('service_slug', serviceSlug)
  if (branchSlug)  q = q.eq('branch_slug', branchSlug)
  const { data } = await q
  return data || []
}

export async function upsertMedia(payload) {
  const { data, error } = await supabase.rpc('dashboard_upsert_media', { p_payload: payload })
  if (error) throw error
  return data
}

export async function deleteMedia(id) {
  const { error } = await supabase.rpc('dashboard_delete_media', { p_id: id })
  if (error) throw error
}

export function publicMediaUrl(bucket, storagePath) {
  if (!bucket || !storagePath) return null
  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath)
  return data?.publicUrl || null
}

// ─── Bookings ────────────────────────────────────────────────
// Notes on the rebuilt schema:
//  - bookings has FKs on customer_id, branch_id, stylist_id, service_id (not service_slug).
//  - stylists.name_th / nickname_en are generated columns aliasing display_name / display_name_en,
//    so PostgREST can still select them.
//  - We embed services by FK (service_id), then expose them under the alias `services` so the
//    UI code that reads booking.services.name_th continues to work.
export async function getBookings(filters = {}) {
  let q = supabase
    .from('bookings')
    .select(`
      *,
      customers:customer_id (id, name, phone),
      branches:branch_id (id, slug, name_th),
      stylists:stylist_id (id, name_th, nickname_en),
      services:service_id (id, slug, name_th, duration_minutes)
    `)
    .order('start_at', { ascending: false })
    .limit(300)
  if (filters.branch)   q = q.eq('branch_id', filters.branch)
  if (filters.status)   q = q.eq('status', filters.status)
  if (filters.dateFrom) q = q.gte('start_at', filters.dateFrom)
  if (filters.dateTo)   q = q.lte('start_at', filters.dateTo)
  const { data, error } = await q
  if (error) console.error('[getBookings] failed:', error)
  return data || []
}

export async function updateBookingStatus(id, status) {
  const { data, error } = await supabase
    .from('bookings').update({ status, updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function cancelBooking(id, reason = 'staff_cancelled') {
  const { data, error } = await supabase.rpc('cancel_booking', {
    p_booking_id: id, p_reason: reason, p_actor: 'staff',
  })
  if (error) throw error
  return data
}

export async function attachPaymentProof(bookingId, proofUrl) {
  const { data, error } = await supabase.rpc('dashboard_attach_payment_proof', {
    p_booking_id: bookingId, p_proof_url: proofUrl,
  })
  if (error) throw error
  return data
}

// ─── Employees ───────────────────────────────────────────────
// Rebuilt schema: employees(id, display_name, email, role, primary_branch_id,
// notification_channel, is_active, created_at). Branch assignments live in the
// employee_branches(employee_id, branch_id) junction table. We translate to/from
// the dashboard's old shape (name, nickname, branch_ids[]) here so the UI stays
// the same.

export async function getEmployees() {
  const { data, error } = await supabase
    .from('employees')
    .select('id, display_name, email, role, primary_branch_id, notification_channel, is_active, created_at, employee_branches(branch_id)')
    .eq('is_active', true)
    .order('display_name')
  if (error) { console.error('[getEmployees] failed:', error); return [] }
  return (data || []).map(_employeeFromDb)
}

function _employeeFromDb(e) {
  const branchIds = Array.isArray(e.employee_branches)
    ? e.employee_branches.map(b => b.branch_id).filter(Boolean)
    : []
  return {
    id: e.id,
    name: e.display_name,
    nickname: null,                 // column does not exist; preserved for UI
    email: e.email,
    phone: null,                    // column does not exist
    role: e.role,
    branch_ids: branchIds,
    primary_branch_id: e.primary_branch_id,
    notification_channel: e.notification_channel,
    notification_wa_id: null,       // column does not exist
    notification_email: e.email,    // fall back to primary email
    is_active: e.is_active,
  }
}

async function _syncEmployeeBranches(employeeId, branchIds) {
  if (!Array.isArray(branchIds)) return
  // Replace the full set: simplest reliable approach for a small junction table.
  await supabase.from('employee_branches').delete().eq('employee_id', employeeId)
  if (branchIds.length > 0) {
    const rows = branchIds.map(branch_id => ({ employee_id: employeeId, branch_id }))
    await supabase.from('employee_branches').insert(rows)
  }
}

export async function createEmployee(emp) {
  // Translate dashboard payload -> new schema columns
  const insertRow = {
    display_name:         emp.name,
    email:                emp.email,
    role:                 emp.role || 'staff',
    primary_branch_id:    (emp.branch_ids && emp.branch_ids[0]) || null,
    notification_channel: emp.notification_channel || 'email',
    is_active:            emp.is_active !== false,
  }
  const { data, error } = await supabase.from('employees').insert(insertRow).select().single()
  if (error) throw error
  await _syncEmployeeBranches(data.id, emp.branch_ids || [])
  // Re-fetch with the junction so the returned shape includes branch_ids
  const { data: full } = await supabase
    .from('employees')
    .select('id, display_name, email, role, primary_branch_id, notification_channel, is_active, created_at, employee_branches(branch_id)')
    .eq('id', data.id).single()
  return _employeeFromDb(full || data)
}

export async function updateEmployee(id, updates) {
  const updateRow = {}
  if (updates.name !== undefined)                 updateRow.display_name         = updates.name
  if (updates.email !== undefined)                updateRow.email                = updates.email
  if (updates.role !== undefined)                 updateRow.role                 = updates.role
  if (updates.notification_channel !== undefined) updateRow.notification_channel = updates.notification_channel
  if (updates.is_active !== undefined)            updateRow.is_active            = updates.is_active
  if (updates.branch_ids !== undefined)           updateRow.primary_branch_id    = updates.branch_ids[0] || null

  if (Object.keys(updateRow).length > 0) {
    const { error } = await supabase.from('employees').update(updateRow).eq('id', id)
    if (error) throw error
  }
  if (updates.branch_ids !== undefined) {
    await _syncEmployeeBranches(id, updates.branch_ids)
  }
  const { data: full } = await supabase
    .from('employees')
    .select('id, display_name, email, role, primary_branch_id, notification_channel, is_active, created_at, employee_branches(branch_id)')
    .eq('id', id).single()
  return _employeeFromDb(full)
}

export async function deactivateEmployee(id) {
  // No deleted_at column in the rebuilt schema; use is_active=false only.
  const { error } = await supabase.from('employees').update({ is_active: false }).eq('id', id)
  if (error) throw error
}

// ─── Stats ───────────────────────────────────────────────────
export async function getDashboardStats() {
  const today = new Date().toISOString().split('T')[0]
  const [convos, handovers, active, bookings, leads] = await Promise.all([
    supabase.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('handover_sessions').select('id', { count: 'exact', head: true }).is('ended_at', null),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'active_bot'),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('start_at', today),
    supabase.from('bookings').select('id', { count: 'exact', head: true }).gte('created_at', today),
  ])
  return {
    conversationsToday: convos.count || 0,
    activeNow: active.count || 0,
    bookingsToday: bookings.count || 0,
    leadsToday: leads.count || 0,
    handoversActive: handovers.count || 0,
  }
}

// ─── Realtime ────────────────────────────────────────────────
export function subscribeToMessages(conversationId, callback) {
  return supabase.channel(`msgs-${conversationId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      payload => callback(payload.new))
    .subscribe()
}

export function subscribeToConversations(callback) {
  return supabase.channel('convos-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => callback())
    .subscribe()
}

// ─── Summary refresh ─────────────────────────────────────────
// Manually regenerate a conversation's summary from the full message history.
// Routes through WF-3 because the LLM call needs an API key that lives in n8n.
// The webhook does: dashboard_get_conversation_full → LLM → dashboard_save_summary.
// Returns the new summary text on success, throws on failure.
export async function regenerateSummary(conversationId) {
  const res = await dashboardAction('regenerate_summary', { conversation_id: conversationId })
  if (!res?.success) {
    throw new Error(res?.error || 'regenerate_failed')
  }
  // WF-3 wraps every handler's output as { success, action, data }. The save-summary
  // node returns the saved row, so read the new summary from `data` (array or object),
  // with fallbacks. The caller also reloads from Supabase as the source of truth.
  const d = res.data ?? res
  const row = Array.isArray(d) ? d[0] : d
  return {
    success: true,
    summary_th:    row?.summary_th    ?? row?._summary_th    ?? null,
    message_count: row?.message_count ?? row?.summary_message_count ?? row?._message_count ?? null,
    conversation_id: conversationId,
  }
}
