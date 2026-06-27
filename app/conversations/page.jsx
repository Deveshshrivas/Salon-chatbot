'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  getActiveConversations, getMessages, getCustomerWithMemory, getHandoverHistory,
  subscribeToMessages, getActivePromotionsForBranch, getMedia,
  uploadFile, clearChatMessages, deleteConversation,
  freezeConversation, resumeConversation, dashboardAction,
  regenerateSummary,
} from '@/lib/supabase'
import { Card, StatusPill, Button, ImageUploader } from '@/components/ui'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// Render any value safely into JSX.
// jsonb columns can come back as objects, arrays, numbers, or strings — React only
// accepts strings/numbers/arrays-of-children. Anything object-shaped gets pretty-printed.
function safeText(v) {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(safeText).filter(Boolean).join(', ')
  try { return JSON.stringify(v) } catch { return String(v) }
}

function timeFull(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })
}

// Bot replies sometimes paste a raw URL (e.g. a long percent-encoded Google Maps link
// from branches.google_maps_url) straight into messages.content_text, which then prints
// as an unreadable wall of text. Scan the text for http(s) URLs and render each as a
// short clickable link: Maps URLs get a friendly "📍 Open map" label, others show "🔗 host".
function renderTextWithLinks(text) {
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part            // plain text, unchanged
    // URLs can swallow trailing punctuation (".", ")") from the sentence — keep it as text.
    const m = part.match(/^(.*?)([.,;:)\]]*)$/s)
    const url = m ? m[1] : part
    const trail = m ? m[2] : ''
    const isMap = /google\.[^/]+\/maps|\/maps\/|[?&]q=-?\d|\/@-?\d/.test(url)
    let host = ''
    try { host = new URL(url).hostname.replace(/^www\./, '') } catch (e) {}
    const label = isMap ? '📍 เปิดแผนที่ (Open map)' : `🔗 ${host || 'link'}`
    return (
      <span key={i}>
        <a href={url} target="_blank" rel="noreferrer" className="underline text-rose-600 break-all">{label}</a>
        {trail}
      </span>
    )
  })
}

// Merge two message lists into one chronological list (oldest→newest), de-duped by
// id, dropping any optimistic placeholder once its real server twin (same role +
// text) has arrived. Used so background polls/realtime add new messages and
// scroll-up adds older ones without ever wiping already-loaded history.
function mergeMessages(a, b) {
  const byId = new Map()
  for (const m of a) byId.set(m.id, m)
  for (const m of b) byId.set(m.id, m)
  const all = [...byId.values()]
  const real = all.filter(m => !m._optimistic)
  const merged = all.filter(m =>
    !m._optimistic ||
    !real.some(s => s.role === m.role && (s.content_text || s.content) === (m.content_text || m.content)))
  merged.sort((x, y) => new Date(x.created_at) - new Date(y.created_at))
  return merged
}

// WF-3's `send_message` action delivers only `text` over the WhatsApp/Messenger
// Graph API — it has no attachment support. Fold any picked attachment into the
// outgoing text so the customer still receives the image/link/promo, and so we
// never send an empty body (which the WhatsApp API rejects).
function composeOutgoingText(text, att) {
  if (!att) return text
  const parts = text ? [text] : []
  if (att.type === 'image' && att.url) {
    parts.push(att.url)
  } else if (att.type === 'link' && att.url) {
    parts.push(att.label ? `${att.label}: ${att.url}` : att.url)
  } else if (att.type === 'promotion') {
    const price = att.price ? ` — ฿${Number(att.price).toLocaleString()}` : ''
    parts.push(`${att.title || 'Promotion'}${price}`)
    if (att.image_url) parts.push(att.image_url)
  }
  return parts.join('\n').trim()
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

// ─── Human-friendly translators ─────────────────────────────
// The DB stores snake_case codes; humans want sentences. These maps + the
// fallback formatter turn `staff_takeover` into "Staff took over", and
// `haircut_customer_type` into "Haircut customer type".

const HANDOVER_REASON_LABEL = {
  staff_takeover:        '👤 Staff took over',
  customer_request:      '🙋 Customer asked for a human',
  bot_uncertain:         '🤔 Bot wasn\'t sure',
  bot_error:             '⚠️ Bot had an error',
  complaint:             '😟 Complaint',
  complex_question:      '❓ Complex question',
  vip_customer:          '⭐ VIP customer',
  outside_hours:         '🕐 Outside business hours',
  manual:                '✋ Manual handover',
  resolved:              '✅ Resolved by staff',
}
function humanizeReason(code) {
  if (!code) return 'Handover'
  if (HANDOVER_REASON_LABEL[code]) return HANDOVER_REASON_LABEL[code]
  // Fallback: snake_case → Sentence case
  return code.replace(/_/g, ' ').replace(/^./, ch => ch.toUpperCase())
}

// Pretty labels for the bot_state fields we know about. Anything else falls
// through to a snake_case → Title Case transform.
const BOT_STATE_LABEL = {
  haircut_customer_type:    'Haircut customer type',
  add_on_service_pending:   'Add-on service pending',
  last_bot_action:          'Last bot action',
  service_interest:         'Interested in',
  soft_sell_offered:        'Soft-sell offered',
  promo_offered:            'Promotion offered',
  booking_step:             'Booking step',
  awaiting_field:           'Waiting on',
  language:                 'Language',
}
function humanizeKey(k) {
  if (BOT_STATE_LABEL[k]) return BOT_STATE_LABEL[k]
  return k.replace(/_/g, ' ').replace(/^./, ch => ch.toUpperCase())
}
function humanizeValue(v) {
  if (v === null || v === undefined) return '—'
  if (v === true)  return '✅ Yes'
  if (v === false) return '✗ No'
  if (typeof v === 'string') {
    // turn snake_case enum values into readable text
    return v.replace(/_/g, ' ')
  }
  if (Array.isArray(v)) return v.map(humanizeValue).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

// Decide whether a bot_state row should be SHOWN by default.
// Null/undefined/empty/false-by-default are noise for non-devs.
function isMeaningful(v) {
  if (v === null || v === undefined) return false
  if (v === false) return false
  if (v === '') return false
  if (Array.isArray(v) && v.length === 0) return false
  if (typeof v === 'object' && Object.keys(v).length === 0) return false
  return true
}

// Turn raw fetch/JSON errors into something a salon owner can act on.
function friendlyError(err) {
  const msg = typeof err === 'string' ? err : (err?.message || 'Something went wrong')
  if (/JSON|Unexpected end/i.test(msg)) {
    return 'The summary service didn\'t respond. Please try again in a moment.'
  }
  if (/network|fetch|failed to fetch/i.test(msg)) {
    return 'Connection problem. Check your internet and try again.'
  }
  if (/timeout|timed out/i.test(msg)) {
    return 'The request took too long. Please try again.'
  }
  if (/401|403|unauthor/i.test(msg)) {
    return 'You don\'t have permission to do that. Please log in again.'
  }
  return msg.length > 120 ? 'Something went wrong. Please try again.' : msg
}

// ─── Bot State Panel ─────────────────────────────────────────
// Translates the raw bot_state JSON into a list of plain-English rows.
// Hides null/false noise by default; staff can expand "More details" to
// see everything, and there's a separate dev-only "Show raw JSON" toggle.
function BotStatePanel({ state }) {
  const [showAll, setShowAll] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  const entries = Object.entries(state || {})
  const meaningful = entries.filter(([, v]) => isMeaningful(v))
  const empty      = entries.filter(([, v]) => !isMeaningful(v))
  const visible    = showAll ? entries : meaningful

  if (entries.length === 0) return null

  return (
    <div className="mt-4 pt-4 border-t border-ink-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs uppercase tracking-wider text-ink-400">What the bot knows</p>
        <button
          onClick={() => setShowRaw(s => !s)}
          className="text-[10px] text-ink-300 hover:text-rose-500 transition"
          title="Developer view">
          {showRaw ? 'hide raw' : '{ } raw'}
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-ink-400 italic">The bot hasn't gathered any details yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {visible.map(([k, v]) => (
            <li key={k} className="flex items-baseline gap-2 text-xs">
              <span className="text-ink-400 shrink-0">{humanizeKey(k)}:</span>
              <span className={`font-medium ${isMeaningful(v) ? 'text-ink-700' : 'text-ink-300'}`}>{humanizeValue(v)}</span>
            </li>
          ))}
        </ul>
      )}

      {empty.length > 0 && (
        <button
          onClick={() => setShowAll(s => !s)}
          className="text-[11px] text-rose-500 hover:text-rose-600 mt-2 transition">
          {showAll ? '− Hide empty fields' : `+ Show ${empty.length} empty field${empty.length === 1 ? '' : 's'}`}
        </button>
      )}

      {showRaw && (
        <pre className="mt-3 text-[10px] bg-cream-bg p-2 rounded text-ink-500 overflow-x-auto max-h-32 scrollbar-thin border border-ink-100">
{JSON.stringify(state, null, 2)}
        </pre>
      )}
    </div>
  )
}

// ─── Side Panel ──────────────────────────────────────────────
function SidePanel({ conv, customerData, memoryData, handoverHistory, onSummaryRefresh }) {
  if (!conv) return null
  const c = customerData || conv.customers || {}
  const m = memoryData || {}
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(null)

  async function handleRefreshSummary() {
    setRefreshing(true); setRefreshError(null)
    try {
      const res = await regenerateSummary(conv.id)
      if (onSummaryRefresh) onSummaryRefresh(res?.summary_th, res?.message_count)
    } catch (e) {
      setRefreshError(e.message || 'failed')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-xs uppercase tracking-wider text-rose-500 mb-3">Customer</h3>
        <div className="space-y-2 text-sm">
          <Row label="Name" value={c.name || conv._identity?.display_name_on_platform || '—'} />
          <Row label="Phone" value={c.phone || '—'} />
          <Row label="Branch" value={conv.branches?.name_th || '—'} />
          <Row label="Channel" value={conv._identity?.channel || '—'} />
          <Row label="VIP" value={c.is_vip ? '⭐ VIP' : 'Standard'} />
          <Row label="Status" value={<StatusPill status={conv.status} />} raw />
          <Row label="Member" value={c.is_member ? `✅ ${c.member_id || ''}` : '—'} />
        </div>
        {conv.bot_state && Object.keys(conv.bot_state || {}).length > 0 && (
          <BotStatePanel state={conv.bot_state} />
        )}
        {conv.pending_question && (
          <div className="mt-3 pt-3 border-t border-ink-100">
            <p className="text-xs uppercase tracking-wider text-rose-400 mb-1">Bot is waiting on</p>
            <p className="text-sm text-ink-700">
              {humanizeKey(safeText(conv.pending_question?.field ?? conv.pending_question?.kind ?? conv.pending_question))}
            </p>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs uppercase tracking-wider text-rose-500">Conversation Summary</h3>
          <button
            onClick={handleRefreshSummary}
            disabled={refreshing}
            title="Regenerate summary from full message history"
            className="text-xs px-2 py-1 rounded-md text-rose-600 hover:bg-rose-50 disabled:text-ink-300 disabled:cursor-wait transition">
            {refreshing ? '⏳ Regenerating…' : '↻ Refresh'}
          </button>
        </div>
        {conv.summary_th ? (
          <p className="text-sm text-ink-700 leading-relaxed whitespace-pre-wrap">{conv.summary_th}</p>
        ) : (
          <div className="text-sm text-ink-400 italic flex items-start gap-2">
            <span aria-hidden className="text-base">📝</span>
            <span>No summary yet. Click <span className="font-medium text-rose-600 not-italic">Refresh</span> to generate one from the chat.</span>
          </div>
        )}
        {conv.summary_updated_at && (
          <p className="text-xs text-ink-300 mt-2">
            Updated {timeAgo(conv.summary_updated_at)} ago
            {conv.summary_message_count != null && ` • ${conv.summary_message_count} msgs`}
          </p>
        )}
        {refreshError && (
          <div className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
            <span aria-hidden>⚠</span><span>{friendlyError(refreshError)}</span>
          </div>
        )}
      </Card>

      {(m.facts || m.preferences || m.service_history || m.treatment_history || m.employee_notes) && (
        <Card className="p-5">
          <h3 className="text-xs uppercase tracking-wider text-rose-500 mb-3">Long-term Memory</h3>
          {m.facts && <div className="mb-3"><p className="text-xs font-medium text-ink-400">Facts</p><p className="text-sm text-ink-700 whitespace-pre-wrap">{safeText(m.facts)}</p></div>}
          {m.preferences && <div className="mb-3"><p className="text-xs font-medium text-ink-400">Preferences</p><p className="text-sm text-ink-700 whitespace-pre-wrap">{safeText(m.preferences)}</p></div>}
          {(m.service_history || m.treatment_history) && <div className="mb-3"><p className="text-xs font-medium text-ink-400">Service History</p><p className="text-sm text-ink-700 whitespace-pre-wrap">{safeText(m.service_history || m.treatment_history)}</p></div>}
          {m.employee_notes && <div className="mb-3 pt-2 border-t border-ink-100"><p className="text-xs font-medium text-ink-400">📌 Staff Notes</p><p className="text-sm text-ink-700 whitespace-pre-wrap">{safeText(m.employee_notes)}</p></div>}
          {m.structured && Object.keys(m.structured).length > 0 && (
            <div><p className="text-xs font-medium text-ink-400 mb-1">Structured</p>
              <pre className="text-xs bg-cream-bg p-2 rounded text-ink-600 overflow-x-auto max-h-32 scrollbar-thin">{JSON.stringify(m.structured, null, 2)}</pre>
            </div>
          )}
        </Card>
      )}

      {handoverHistory?.length > 0 && (
        <Card className="p-5">
          <h3 className="text-xs uppercase tracking-wider text-rose-500 mb-3">Handover History ({handoverHistory.length})</h3>
          <div className="space-y-4">
            {handoverHistory.map(h => {
              const staffName = h.employees?.nickname || h.employees?.name
              const durationMin = h.ended_at && h.started_at
                ? Math.round((new Date(h.ended_at) - new Date(h.started_at)) / 60000) : null
              const isActive = !h.ended_at
              return (
                <div key={h.id} className={`relative pl-4 ${isActive ? 'border-l-2 border-rose-400' : 'border-l-2 border-ink-100'}`}>
                  {/* Status pill + headline */}
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${isActive ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                      {isActive ? '● Ongoing' : '✓ Resolved'}
                    </span>
                    <span className="text-sm font-medium text-ink-800">{humanizeReason(h.reason)}</span>
                  </div>
                  {/* Who + when, in one plain-English line */}
                  <p className="text-xs text-ink-500">
                    {staffName ? <>Handled by <span className="font-medium text-ink-700">{staffName}</span> · </> : null}
                    Started {timeAgo(h.started_at)} ago
                    {h.ended_at && <> · ended {timeAgo(h.ended_at)} ago</>}
                    {durationMin != null && <> · took {durationMin < 60 ? `${durationMin} min` : `${Math.floor(durationMin/60)}h ${durationMin%60}m`}</>}
                  </p>
                  {h.resolution_notes && (
                    <p className="text-xs text-ink-600 mt-1.5 bg-cream-bg rounded-md px-2 py-1.5 italic">
                      "{h.resolution_notes}"
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}

function Row({ label, value, raw }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-ink-300 w-16 shrink-0 text-xs uppercase tracking-wider">{label}</span>
      {raw ? value : <span className="text-ink-700 truncate flex-1">{safeText(value) || '—'}</span>}
    </div>
  )
}

// ─── Attachment Picker ───────────────────────────────────────
function AttachmentPicker({ open, onClose, onPick, branchId, branchSlug }) {
  const [tab, setTab] = useState('image')
  const [linkUrl, setLinkUrl] = useState(''); const [linkLabel, setLinkLabel] = useState('')
  const [imgUrl, setImgUrl] = useState('')
  const [promos, setPromos] = useState([]); const [media, setMedia] = useState([])

  useEffect(() => {
    if (!open) return
    if (tab === 'promo') getActivePromotionsForBranch(branchId).then(p => setPromos(p || []))
    if (tab === 'media') getMedia({ branchSlug }).then(m => setMedia(m || []))
  }, [open, tab, branchId, branchSlug])

  if (!open) return null

  function pickLink() {
    if (!linkUrl.trim()) return
    onPick({ type: 'link', url: linkUrl.trim(), label: linkLabel.trim() || linkUrl.trim() })
    setLinkUrl(''); setLinkLabel(''); onClose()
  }
  function pickImage(url) {
    if (!url) return
    onPick({ type: 'image', url })
    setImgUrl(''); onClose()
  }
  function pickPromo(p) {
    onPick({
      type: 'promotion', promotion_id: p.id,
      title: p.title_th, price: p.promo_price, original: p.original_price ?? p.regular_price,
      image_url: p.image_url, before_after_url: p.before_image_url || p.after_image_url,
      description: p.description_th,
    })
    onClose()
  }
  function pickMedia(m) {
    const url = m.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${m.storage_bucket}/${m.storage_path}`
    onPick({ type: 'image', url, label: m.title_th || m.title_en })
    onClose()
  }

  const TABS = [['image','📷 Image'], ['media','🖼️ Library'], ['promo','🏷️ Promotion'], ['link','🔗 Link']]

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-ink-100 rounded-2xl shadow-xl z-10 overflow-hidden">
      <div className="flex border-b border-ink-100">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 text-xs px-3 py-2.5 transition ${tab === k ? 'bg-rose-50 text-rose-700 font-medium border-b-2 border-rose-500' : 'text-ink-500 hover:bg-cream-bg'}`}>
            {l}
          </button>
        ))}
        <button onClick={onClose} className="px-3 text-ink-300 hover:text-ink-600">✕</button>
      </div>
      <div className="p-4 max-h-80 overflow-y-auto scrollbar-thin">
        {tab === 'image' && (
          <div className="space-y-3">
            <ImageUploader bucket="chat_uploads" label="" value={imgUrl}
              onUploaded={r => pickImage(r.url)} onCleared={() => setImgUrl('')} height="h-28" />
            <p className="text-xs text-ink-300 text-center">— or paste URL —</p>
            <div className="flex gap-2">
              <input type="text" value={imgUrl} onChange={e => setImgUrl(e.target.value)}
                placeholder="https://..." className="flex-1 px-3 py-2 text-sm border border-ink-100 rounded-lg focus:border-rose-400" />
              <Button onClick={() => pickImage(imgUrl)} disabled={!imgUrl.trim()} variant="rose" size="md">Use</Button>
            </div>
          </div>
        )}
        {tab === 'media' && (
          <div className="grid grid-cols-3 gap-2">
            {media.length === 0 && <p className="col-span-3 text-xs text-ink-300 text-center py-4">No media in library{branchSlug ? ` for ${branchSlug}` : ''}</p>}
            {media.map(m => {
              const url = m.image_url || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${m.storage_bucket}/${m.storage_path}`
              return (
                <button key={m.id} onClick={() => pickMedia(m)}
                  className="aspect-square rounded-lg overflow-hidden border border-ink-100 hover:border-rose-400 transition group">
                  <img src={url} alt={m.title_th || ''} className="w-full h-full object-cover" />
                </button>
              )
            })}
          </div>
        )}
        {tab === 'promo' && (
          <div className="space-y-2">
            {promos.length === 0 && <p className="text-xs text-ink-300 text-center py-4">No active promotions</p>}
            {promos.map(p => (
              <button key={p.promo_id || p.id} onClick={() => pickPromo(p)}
                className="w-full text-left p-2 hover:bg-rose-50 rounded-lg flex gap-2 items-center border border-ink-100 transition">
                {p.image_url && <img src={p.image_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-ink-800 truncate">{p.title_th}</p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-sm font-bold text-rose-600">฿{Number(p.promo_price || 0).toLocaleString()}</span>
                    {(p.original_price ?? p.regular_price) && <span className="text-xs text-ink-300 line-through">฿{Number(p.original_price ?? p.regular_price).toLocaleString()}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        {tab === 'link' && (
          <div className="space-y-2">
            <input type="text" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://..."
              className="w-full px-3 py-2 text-sm border border-ink-100 rounded-lg focus:border-rose-400" />
            <input type="text" value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Link label (optional)"
              className="w-full px-3 py-2 text-sm border border-ink-100 rounded-lg focus:border-rose-400" />
            <Button onClick={pickLink} disabled={!linkUrl.trim()} variant="rose" className="w-full">Attach Link</Button>
          </div>
        )}
      </div>
    </div>
  )
}

function AttachmentPreview({ attachment, onRemove }) {
  if (!attachment) return null
  return (
    <div className="mb-2 p-2.5 bg-rose-50/60 border border-rose-200 rounded-xl flex items-center gap-3">
      <div className="flex-1 min-w-0">
        {attachment.type === 'link' && <p className="text-xs text-rose-700 truncate">🔗 {attachment.label || attachment.url}</p>}
        {attachment.type === 'image' && (
          <div className="flex items-center gap-2">
            <img src={attachment.url} alt="" className="w-10 h-10 rounded object-cover" />
            <p className="text-xs text-rose-700 truncate">🖼️ Image</p>
          </div>
        )}
        {attachment.type === 'promotion' && (
          <div className="flex items-center gap-2">
            {attachment.image_url && <img src={attachment.image_url} alt="" className="w-10 h-10 rounded object-cover" />}
            <div className="min-w-0">
              <p className="text-xs font-medium text-rose-700 truncate">🏷️ {attachment.title}</p>
              <p className="text-xs text-rose-500">฿{Number(attachment.price || 0).toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>
      <button onClick={onRemove} className="text-xs text-rose-500 hover:text-rose-700 px-2">✕</button>
    </div>
  )
}

// Render a before/after image pair side-by-side (or a single one if only one is
// present), with corner labels. Used both for standalone before/after attachments
// and inside the promotion block when a promo carries result photos.
function BeforeAfterPair({ before, after, className = '' }) {
  if (!before && !after) return null
  return (
    <div className={`grid ${before && after ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5 ${className}`}>
      {before && (
        <div className="relative">
          <img src={before} alt="before" className="w-full max-h-40 object-cover rounded-lg" />
          <span className="absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/55 text-white">Before</span>
        </div>
      )}
      {after && (
        <div className="relative">
          <img src={after} alt="after" className="w-full max-h-40 object-cover rounded-lg" />
          <span className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/55 text-white">After</span>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg }) {
  // Layout rule:
  //   - direction='inbound'  → customer sent it → LEFT
  //   - direction='outbound' → we sent it (bot OR staff) → RIGHT
  //
  // We rely on `direction` (not `role`) because the real DB stores
  //   role='user'     direction='inbound'   for customer messages
  //   role='bot'      direction='outbound'  for bot messages
  //   role='employee' direction='outbound'  for staff messages
  // and we want left/right to be reliable even if `role` ever varies.
  const direction = (msg.direction || '').toLowerCase()
  const rawRole = (msg.role || '').toLowerCase()
  const isBot      = rawRole === 'bot' || rawRole === 'assistant' || rawRole === 'ai'
  const isEmployee = rawRole === 'employee' || rawRole === 'staff' || rawRole === 'agent' || rawRole === 'human_agent'

  let isCustomer
  if (direction === 'inbound')       isCustomer = true
  else if (direction === 'outbound') isCustomer = false
  else                               isCustomer = !isBot && !isEmployee  // fallback if direction missing

  let att = null
  if (msg.metadata) { try { att = typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata } catch (e) {} }
  const text = msg.content_text || msg.content || ''

  // Pull an image URL out of metadata for ANY image-bearing attachment type
  // (deposit_qr, size chart, before/after, portfolio…), not just type==='image'.
  // promotion/link/map have their own render blocks below, so exclude them here.
  // Collect EVERY image the bot recorded on this message. The real data shape stores
  // each image as its own entry in metadata.attachments[] with a `type` tag
  // (promotion, before_after_before, before_after_after, deposit_qr, image=size chart…),
  // so reading the array shows the promo AND Before AND After — not just the first.
  // We fall back to the flat fields for older/simpler messages without attachments[].
  const clean = v => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const SKIP_TYPES = new Set(['location', 'link', 'map'])
  const attItems = (() => {
    if (!att || typeof att !== 'object') return []
    const out = []
    const seen = new Set()
    const push = (url, type) => {
      const u = clean(url)
      if (!u || seen.has(u)) return
      seen.add(u); out.push({ url: u, type: (type || '').toLowerCase() })
    }
    if (Array.isArray(att.attachments)) {
      for (const a of att.attachments) {
        if (a && typeof a === 'object' && !SKIP_TYPES.has(a.type)) push(a.url || a.image_url, a.type)
      }
    }
    if (out.length === 0) {
      const bf = att.before_image_url || att.before_url
      const af = att.after_image_url || att.after_url
      if (bf || af) { push(bf, 'before_after_before'); push(af, 'before_after_after') }
      else if (!SKIP_TYPES.has(att.type)) push(att.url || att.image_url || att.first_attachment?.url, att.type)
    }
    return out
  })()

  const isBeforeType = t => /_before$/.test(t) || t === 'before'
  const isAfterType  = t => /_after$/.test(t)  || t === 'after'
  const beforeUrl = attItems.find(i => isBeforeType(i.type))?.url || null
  const afterUrl  = attItems.find(i => isAfterType(i.type))?.url || null
  const combinedBA = clean(att?.before_after_url)
  const hasBeforeAfter = !!(beforeUrl || afterUrl)
  const isPromo = att?.type === 'promotion' || attItems.some(i => i.type === 'promotion')
  const promoUrl = isPromo ? (attItems.find(i => i.type === 'promotion')?.url || clean(att?.image_url)) : null
  // Everything that isn't the promo poster or a before/after shot — QR, size chart,
  // portfolio, staff uploads, generic images.
  const otherUrls = attItems
    .filter(i => i.type !== 'promotion' && !isBeforeType(i.type) && !isAfterType(i.type))
    .map(i => i.url)

  if (!text && !att) return null

  // Customer ALWAYS on the left, bot/staff ALWAYS on the right.
  const align = isCustomer ? 'justify-start' : 'justify-end'

  // Color uses role to distinguish bot pink vs staff amber on the right side.
  const bubbleCls = isCustomer ? 'bubble-customer text-ink-800'
                  : isEmployee ? 'bubble-employee text-ink-800'
                  : 'bubble-bot text-ink-800'

  const avatar = isCustomer ? (
    <div className="w-7 h-7 rounded-full bg-white border border-ink-100 text-ink-500 text-[11px] font-semibold flex items-center justify-center shrink-0 self-end mb-4 shadow-sm" title="Customer">C</div>
  ) : isEmployee ? (
    <div className="w-7 h-7 rounded-full bg-amber-100 border border-amber-200 text-amber-700 text-[11px] font-semibold flex items-center justify-center shrink-0 self-end mb-4 shadow-sm" title="Staff">S</div>
  ) : (
    <div className="w-7 h-7 rounded-full bg-rose-100 border border-rose-200 text-rose-600 text-[11px] font-semibold flex items-center justify-center shrink-0 self-end mb-4 shadow-sm" title="Bot">B</div>
  )

  const roleLabel = isCustomer ? 'Customer' : isEmployee ? `Staff${msg._optimistic ? ' • sending…' : ''}` : 'Nong (bot)'
  const roleColorCls = isCustomer ? 'text-ink-500' : isEmployee ? 'text-amber-700' : 'text-rose-600'

  return (
    <div className={`flex gap-2 ${align}`}>
      {isCustomer && avatar}
      <div className="flex max-w-[min(76%,640px)] flex-col">
        <p className={`text-[11px] font-medium mb-1 px-1 ${roleColorCls} ${isCustomer ? 'text-left' : 'text-right'}`}>
          {roleLabel}
        </p>
        <div className={`px-4 py-2.5 text-sm leading-relaxed break-words ${bubbleCls}`}>
          {/* Plain images: QR codes, size charts, portfolio, staff uploads, etc. */}
          {!isPromo && otherUrls.map((u, i) => (
            <img key={i} src={u} alt="" className="rounded-lg mb-2 max-w-full max-h-48 object-contain" />
          ))}
          {/* Standalone Before / After pair */}
          {!isPromo && hasBeforeAfter && <BeforeAfterPair before={beforeUrl} after={afterUrl} className="mb-2" />}
          {/* Promotion card: poster + optional before/after + title/price */}
          {isPromo && (
            <div className="mb-2 p-2 bg-white/70 rounded-lg border border-white/80">
              {promoUrl && <img src={promoUrl} alt="" className="w-full max-h-40 object-cover rounded mb-2" />}
              {hasBeforeAfter
                ? <BeforeAfterPair before={beforeUrl} after={afterUrl} className="mb-2" />
                : combinedBA && <img src={combinedBA} alt="" className="w-full max-h-32 object-cover rounded mb-2" />}
              {att.title && <p className="text-xs font-semibold">{att.title}</p>}
              {att.price != null && att.price !== '' && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold">฿{Number(att.price || 0).toLocaleString()}</span>
                  {att.original && <span className="text-xs text-ink-300 line-through">฿{Number(att.original).toLocaleString()}</span>}
                </div>
              )}
            </div>
          )}
          {att?.type === 'link' && <a href={att.url} target="_blank" rel="noreferrer" className="block mb-1 text-xs underline break-all">🔗 {att.label || att.url}</a>}
          {text && <p style={{ whiteSpace: 'pre-wrap' }}>{renderTextWithLinks(text)}</p>}
          <p className={`text-[11px] mt-1.5 text-ink-400 ${isCustomer ? 'text-left' : 'text-right'}`}>
            {msg.created_at ? new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''}
          </p>
        </div>
      </div>
      {!isCustomer && avatar}
    </div>
  )
}

// ─── Main ────────────────────────────────────────────────────
function ConversationsInner() {
  const searchParams = useSearchParams()
  const [conversations, setConversations] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [customerData, setCustomerData] = useState(null)
  const [memoryData, setMemoryData] = useState(null)
  const [handoverHistory, setHandoverHistory] = useState([])
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [handoverBusy, setHandoverBusy] = useState(false)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [attachment, setAttachment] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)  // mobile/tablet customer-detail drawer
  const [hasMoreOlder, setHasMoreOlder] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const loadingOlderRef = useRef(false)
  const PAGE = 50
  const chatScrollRef = useRef(null)
  const chatContentRef = useRef(null)
  const chatEndRef = useRef(null)
  const selected = conversations.find(c => c.id === selectedId)

  async function loadConversations() { try { setConversations(await getActiveConversations()) } catch (e) { console.error(e) } }

  useEffect(() => { loadConversations(); const i = setInterval(loadConversations, 15000); return () => clearInterval(i) }, [])
  useEffect(() => { const urlId = searchParams.get('id'); if (urlId) setSelectedId(urlId) }, [searchParams])

  useEffect(() => {
    if (!selectedId || !selected) return
    let cancelled = false

    // Fetch the most recent page and merge it in. Polling/realtime use this to ADD
    // new messages without dropping older history the user already scrolled up into.
    async function loadLatest(initial) {
      const msgs = await getMessages(selectedId, { limit: PAGE })
      if (cancelled) return
      if (initial) {
        setMessages(msgs)
        setHasMoreOlder(msgs.length >= PAGE)
      } else {
        setMessages(prev => mergeMessages(prev, msgs))
      }
    }

    async function loadSidebar() {
      const hh = await getHandoverHistory(selectedId)
      if (cancelled) return
      setHandoverHistory(hh)
      if (selected.customer_id) {
        const { customer, memory } = await getCustomerWithMemory(selected.customer_id)
        if (cancelled) return
        setCustomerData(customer); setMemoryData(memory)
      }
    }

    setMessages([]); setHasMoreOlder(false)
    loadLatest(true); loadSidebar()

    // Realtime is the fast path, but it silently no-ops if the `messages` table
    // isn't in Supabase's realtime publication (or the websocket drops). Poll every
    // 4s as a guaranteed fallback so inbound customer + bot messages always show up.
    const poll = setInterval(() => loadLatest(false), 4000)

    const sub = subscribeToMessages(selectedId, newMsg => {
      setMessages(prev => mergeMessages(prev, [newMsg]))
    })
    return () => { cancelled = true; clearInterval(poll); sub.unsubscribe() }
  }, [selectedId, selected?.customer_id])

  // WhatsApp-style "scroll up to load older". Fetches the page before the oldest
  // loaded message and prepends it, preserving the scroll position so the view
  // doesn't jump.
  async function loadOlder() {
    if (loadingOlderRef.current || !hasMoreOlder) return
    const el = chatScrollRef.current
    const oldest = messages.find(m => !m._optimistic)
    if (!oldest) return
    loadingOlderRef.current = true; setLoadingOlder(true)
    const prevHeight = el ? el.scrollHeight : 0
    try {
      const older = await getMessages(selectedId, { before: oldest.created_at, limit: PAGE })
      setMessages(prev => mergeMessages(older, prev))
      setHasMoreOlder(older.length >= PAGE)
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight })
    } finally {
      loadingOlderRef.current = false; setLoadingOlder(false)
    }
  }

  function handleChatScroll(e) {
    const el = e.currentTarget
    if (el.scrollTop < 60) loadOlder()
    // Track whether the user is parked at the bottom. While they are, we keep the view
    // pinned to the newest message (see the ResizeObserver below); once they scroll up
    // to read history, we stop auto-following so we never yank them back down.
    if (!loadingOlderRef.current) {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    }
  }

  // Auto-scroll to the newest message. Opening a conversation should always land at the
  // bottom (latest), and it should STAY there even as images (size charts, promo/QR
  // photos) finish loading and grow the content after the initial paint — which a
  // one-shot scroll can't handle. So we keep a "stick to bottom" flag and a
  // ResizeObserver that re-pins on every content size change while the flag is set.
  const stickRef = useRef(true)
  // Re-arm sticking whenever the conversation changes (the list is cleared then
  // refilled asynchronously, so we must pin until the real messages + images settle).
  useEffect(() => { stickRef.current = true }, [selectedId])

  // Pin to bottom on message changes (new message, send, poll) when we're sticking.
  useEffect(() => {
    const el = chatScrollRef.current
    if (!el || loadingOlderRef.current) return
    if (stickRef.current && messages.length > 0) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
    }
  }, [messages, selectedId])

  // Keep pinned to the bottom while the content keeps growing (images decoding, font
  // reflow) right after open — the key fix for the latest message slipping below the
  // fold once a tall image loads.
  useEffect(() => {
    const el = chatScrollRef.current
    const content = chatContentRef.current
    if (!el || !content || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      if (!loadingOlderRef.current && stickRef.current) el.scrollTop = el.scrollHeight
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [selectedId])

  async function handleTakeover() {
    if (!selected) return
    setHandoverBusy(true)
    try {
      const result = await freezeConversation(selected, null, 'staff_takeover')
      if (result?.error) { alert('Takeover failed: ' + (result.error.message || result.error)); return }
      setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, status: 'human_handling' } : c))
      setHandoverHistory(await getHandoverHistory(selectedId))
      setTimeout(loadConversations, 3000)
    } catch (e) { alert('Takeover failed: ' + e.message) }
    finally { setHandoverBusy(false) }
  }
  async function handleRelease() {
    if (!selected) return
    setHandoverBusy(true)
    try {
      const result = await resumeConversation(selected, 'resolved')
      if (result?.error) { alert('Release failed: ' + (result.error.message || result.error)); return }
      setConversations(prev => prev.map(c => c.id === selectedId ? { ...c, status: 'active_bot' } : c))
      setHandoverHistory(await getHandoverHistory(selectedId))
      setTimeout(loadConversations, 3000)
    } catch (e) { alert('Release failed: ' + e.message) }
    finally { setHandoverBusy(false) }
  }
  async function handleClearChat() {
    if (!selected) return
    if (!confirm('Clear all messages in this chat? This is permanent.')) return
    try { await clearChatMessages(selectedId); setMessages([]); loadConversations() } catch (e) { alert('Clear failed: ' + e.message) }
  }
  async function handleDelete() {
    if (!selected) return
    if (!confirm(`Permanently delete this conversation? Messages, handover history, and customer (if no other conversations) will all be removed. This cannot be undone.`)) return
    if (!confirm('Are you sure? Really sure?')) return
    try {
      await deleteConversation(selectedId, selected.customer_id)
      setSelectedId(null); setMessages([]); setCustomerData(null); setMemoryData(null)
      loadConversations()
    } catch (e) { alert('Delete failed: ' + e.message) }
  }

  async function sendReply() {
    if ((!replyText.trim() && !attachment) || !selected) return
    setSending(true)
    const att = attachment
    // WF-3 send_message is text-only, so flatten the attachment into the text.
    const text = composeOutgoingText(replyText.trim(), att)

    // Two modes, decided by takeover state:
    //  • NOT taken over (bot active) → treat the text as an INBOUND customer message
    //    and run the bot (action: simulate_message); it shows as the customer and the
    //    bot replies via the message poll.
    //  • Taken over → send as a STAFF reply to the customer (action: send_message).
    const asCustomer = !replying
    const optimistic = {
      id: `opt-${Date.now()}`, conversation_id: selectedId,
      role: asCustomer ? 'user' : 'employee',
      direction: asCustomer ? 'inbound' : 'outbound',
      content_text: text,
      created_at: new Date().toISOString(), metadata: asCustomer ? null : (att || null), _optimistic: true,
    }
    setMessages(prev => [...prev, optimistic]); setReplyText(''); setAttachment(null)
    try {
      const phoneNumberId = channelAccountExternalId(selected)
      const res = asCustomer
        ? await dashboardAction('simulate_message', {
            conversation_id: selectedId,
            channel: selected._identity?.channel || 'whatsapp',
            wa_id: selected._identity?.external_id,
            phone_number_id: phoneNumberId,
            display_name: selected._display_name,
            message_id: `dash-${Date.now()}`,
            received_at: Date.now(),
            text,
          })
        : await dashboardAction('send_message', {
            conversation_id: selectedId,
            channel: selected._identity?.channel || 'whatsapp',
            wa_id: selected._identity?.external_id,
            phone_number_id: phoneNumberId,
            text,
          })
      // dashboardAction resolves on any HTTP status, so inspect the WF-3 envelope.
      if (res && res.success === false) throw new Error(res.error || (asCustomer ? 'simulate_failed' : 'send_failed'))
    } catch (e) {
      setMessages(prev => prev.map(m => m.id === optimistic.id ? { ...m, _failed: true } : m))
      alert((asCustomer ? 'Bot test failed: ' : 'Send failed: ') + e.message)
    }
    setSending(false)
  }

  const filtered = conversations.filter(c => {
    if (filter === 'human' && !['awaiting_human', 'human_handling'].includes(c.status)) return false
    if (filter === 'bot' && c.status !== 'active_bot') return false
    if (search) {
      const s = search.toLowerCase()
      const name = (c._display_name || '').toLowerCase()
      const branch = (c.branches?.slug || c.branches?.name_th || '').toLowerCase()
      if (!name.includes(s) && !branch.includes(s)) return false
    }
    return true
  })

  // Optimistically patch the selected conversation in local state so the new summary
  // is visible immediately, then reload from the server to pick up summary_updated_at
  // and message_count from the source of truth.
  function handleSummaryRefresh(newSummary, newCount) {
    setConversations(prev => prev.map(c =>
      c.id === selectedId
        ? { ...c, summary_th: newSummary,
            summary_message_count: newCount ?? c.summary_message_count,
            summary_updated_at: new Date().toISOString() }
        : c
    ))
    loadConversations()
  }

  const replying = ['human_handling', 'awaiting_human'].includes(selected?.status)
  // Staff can send to any selected conversation without taking over first; takeover
  // stays available for when they want the bot to stop and own the chat.
  const canReply = !!selected

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className={`w-full md:w-80 border-r border-ink-100 bg-white flex-col shrink-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-ink-100">
          <input type="text" placeholder="🔍 Search by name or branch…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-cream-bg border border-ink-100 rounded-lg focus:border-rose-400 transition" />
          <div className="flex gap-1 mt-2.5">
            {[['all','All'], ['bot','🤖 Bot'], ['human','👤 Human']].map(([f,l]) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1 rounded-full transition ${filter === f ? 'bg-ink-800 text-cream-bg' : 'bg-cream-bg text-ink-500 hover:bg-ink-100'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filtered.map(c => {
            const isSel = c.id === selectedId
            return (
              <button key={c.id} onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-ink-50 transition ${isSel ? 'bg-rose-50 border-l-2 border-l-rose-500' : 'hover:bg-cream-bg'}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${c.status === 'human_handling' ? 'bg-rose-500' : c.status === 'awaiting_human' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
                  <span className="text-sm font-medium text-ink-800 truncate">{c._display_name}</span>
                  {c.customers?.is_vip && <span className="text-xs">⭐</span>}
                  <span className="text-xs text-ink-300 ml-auto shrink-0">{timeAgo(c.last_inbound_at)}</span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {c.branches?.slug && <span className="text-xs text-rose-600">{c.branches.name_th || c.branches.slug}</span>}
                  <span className="text-xs text-ink-400">{c._identity?.channel || ''}</span>
                </div>
              </button>
            )
          })}
          {filtered.length === 0 && <p className="p-6 text-sm text-ink-300 text-center">No conversations found</p>}
        </div>
      </div>

      {!selected ? (
        <div className="flex-1 hidden md:flex items-center justify-center text-ink-300 bg-cream-bg">
          <div className="text-center">
            <p className="text-5xl mb-3">💬</p>
            <p className="display text-xl text-ink-500">Select a conversation</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex min-w-0 min-h-0">
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            <div className="md:h-20 min-h-[5rem] px-4 md:px-6 py-3 md:py-0 flex items-center gap-3 justify-between border-b border-ink-100 bg-white shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <button onClick={() => setSelectedId(null)} aria-label="Back to list"
                  className="md:hidden text-xl text-ink-500 hover:text-rose-500 w-8 h-8 -ml-1 flex items-center justify-center rounded-lg hover:bg-cream-bg shrink-0">
                  ←
                </button>
                <div className="min-w-0">
                  <h2 className="display text-lg md:text-xl text-ink-800 truncate">{selected._display_name}</h2>
                  <p className="text-xs text-ink-400 mt-0.5 truncate">
                    {selected.branches?.name_th || 'No branch'} • {messages.length} messages • {selected._identity?.channel}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <StatusPill status={selected.status} />
                <button onClick={() => setInfoOpen(true)} title="Customer details"
                  className="lg:hidden text-sm px-2.5 py-1 rounded-lg border border-ink-100 text-ink-500 hover:bg-cream-bg transition">
                  ℹ️
                </button>
                {selected.status === 'active_bot' ? (
                  <Button onClick={handleTakeover} disabled={handoverBusy} variant="rose" size="sm">
                    {handoverBusy ? 'Taking over...' : 'Takeover'}
                  </Button>
                ) : (
                  <Button onClick={handleRelease} disabled={handoverBusy} variant="primary" size="sm">
                    {handoverBusy ? 'Releasing...' : 'Release'}
                  </Button>
                )}
                <Button onClick={handleClearChat} variant="soft" size="sm" title="Clear all messages">Clear</Button>
                <Button onClick={handleDelete} variant="danger" size="sm" title="Delete conversation">Delete</Button>
              </div>
            </div>
            <div ref={chatScrollRef} onScroll={handleChatScroll} className="flex-1 min-h-0 overflow-y-auto bg-[#f8f5f1] scrollbar-thin">
              <div ref={chatContentRef} className="mx-auto flex min-h-full w-full max-w-4xl flex-col justify-end gap-3 px-5 py-5">
                {messages.length === 0 ? (
                  <div className="my-auto text-center text-sm text-ink-300">
                    No messages in this conversation yet
                  </div>
                ) : (
                  <>
                    {loadingOlder ? (
                      <p className="text-center text-xs text-ink-300 py-1">Loading older messages…</p>
                    ) : hasMoreOlder ? (
                      <button onClick={loadOlder} className="text-center text-xs text-rose-500 hover:text-rose-600 py-1">
                        ↑ Load older messages
                      </button>
                    ) : (
                      <p className="text-center text-xs text-ink-300 py-1">— beginning of conversation —</p>
                    )}
                    {messages.map(m => <MessageBubble key={m.id} msg={m} />)}
                  </>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>
            <div className="p-4 border-t border-ink-100 bg-white shrink-0 relative">
              {!replying && (
                <p className="text-xs text-ink-400 mb-2">
                  🤖 Bot active — your message is sent <span className="font-medium">as the customer</span> and the bot replies. Press <span className="font-medium">Takeover</span> to reply as staff.
                </p>
              )}
              <AttachmentPreview attachment={attachment} onRemove={() => setAttachment(null)} />
              <AttachmentPicker open={pickerOpen} onClose={() => setPickerOpen(false)}
                onPick={setAttachment} branchId={selected.branch_id} branchSlug={selected.branches?.slug} />
              <div className="flex gap-2 items-end">
                <button onClick={() => setPickerOpen(!pickerOpen)} disabled={!canReply}
                  className="px-3 py-2.5 text-xl text-ink-400 hover:text-rose-500 disabled:opacity-30">📎</button>
                <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
                  placeholder={!canReply ? 'Select a conversation' : 'Type a message…'} disabled={!canReply}
                  className="flex-1 px-4 py-2.5 text-sm border border-ink-100 rounded-xl focus:border-rose-400 disabled:bg-cream-bg disabled:text-ink-300" />
                <Button onClick={sendReply} disabled={!canReply || sending || (!replyText.trim() && !attachment)} variant="rose">
                  {sending ? '…' : 'Send'}
                </Button>
              </div>
            </div>
          </div>
          {/* Detail panel: static column on large screens */}
          <div className="hidden lg:block w-80 border-l border-ink-100 bg-cream-bg p-5 overflow-y-auto scrollbar-thin shrink-0">
            <SidePanel conv={selected} customerData={customerData} memoryData={memoryData}
              handoverHistory={handoverHistory} onSummaryRefresh={handleSummaryRefresh} />
          </div>

          {/* Detail panel: slide-in drawer on mobile/tablet */}
          {infoOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div onClick={() => setInfoOpen(false)} className="absolute inset-0 bg-ink-900/40" aria-hidden />
              <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85%] bg-cream-bg p-5 overflow-y-auto scrollbar-thin shadow-xl">
                <div className="flex justify-end mb-2">
                  <button onClick={() => setInfoOpen(false)} aria-label="Close details"
                    className="text-ink-400 hover:text-ink-700 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white transition">✕</button>
                </div>
                <SidePanel conv={selected} customerData={customerData} memoryData={memoryData}
                  handoverHistory={handoverHistory} onSummaryRefresh={handleSummaryRefresh} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ConversationsPage() {
  return <Suspense fallback={<div className="p-8 text-center text-ink-300">Loading…</div>}><ConversationsInner /></Suspense>
}
