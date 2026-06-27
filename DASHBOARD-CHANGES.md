# Dashboard Updates — Tables & Attributes

Only the **dashboard** (`Soaln-chatbot/`, static Next.js export). Two files changed.
Both require `npm run build` + redeploy to go live.

---

## Change 1 — Show bot images (QR, size chart, etc.)

**File:** `Soaln-chatbot/app/conversations/page.jsx` → `MessageBubble`

**Table read:** `messages` (via `getMessages()` → `SELECT * FROM messages WHERE conversation_id = …`)

**Attributes (columns) used:**

| Column | Type | Used for |
|---|---|---|
| `metadata` | jsonb | the attachment/image (main one for this fix) |
| `content_text` (fallback `content`) | text | bubble text |
| `role` | text | bot vs customer vs staff styling |
| `direction` | text | inbound/outbound side |
| `created_at` | timestamptz | timestamp |

**Inside `metadata` (jsonb) the new code reads, in order:**
`metadata.type`, `metadata.url`, `metadata.image_url`, `metadata.first_attachment.url`, `metadata.attachments[].url`

**Before:** only rendered an image when `metadata.type === 'image'`.
**After:** renders for any image-bearing type (`deposit_qr`, size chart, before/after, portfolio…), excluding `promotion`/`link`/`map` which have their own blocks.

```js
const attImageUrl = (() => {
  if (!att || typeof att !== 'object') return null
  if (att.type === 'promotion' || att.type === 'link' || att.type === 'map') return null
  const cand = att.url || att.image_url || att.first_attachment?.url ||
    (Array.isArray(att.attachments) ? att.attachments.find(a => a && a.url)?.url : null)
  return typeof cand === 'string' && cand.trim() ? cand : null
})()
// render:  {attImageUrl && <img src={attImageUrl} ... />}
```

---

## Change 2 — Fix inbox order (recent chats on top)

**File:** `Soaln-chatbot/lib/supabase.js` → `getActiveConversations()`

**Table read:** `conversations`

**Attributes (columns) used:**

| Column | Type | Used for |
|---|---|---|
| `last_message_at` | timestamptz | **new primary sort** (reliably updated) |
| `last_inbound_at` | timestamptz | old sort key — often NULL, now secondary |
| `created_at` | timestamptz | final tie-break |
| `status` | text | filter: `active_bot`, `awaiting_human`, `human_handling` |
| `branch_id` | uuid | join → `branches (id, slug, name_th)` |
| `customer_id` | uuid | join → `customers (id, name, phone, is_vip)` + `customer_identities` |
| `channel_account_id` | uuid | join → `channel_accounts (id, channel, external_id, wa_phone_number, branch_id)` |

**Before:** `.order('last_inbound_at', desc)` only → NULL values sank active chats.
**After:**
```js
q = q
  .order('last_message_at', { ascending: false, nullsFirst: false })
  .order('last_inbound_at', { ascending: false, nullsFirst: false })
  .order('created_at',      { ascending: false, nullsFirst: false })
  .limit(150)
```

**Related tables joined in this query (read-only):**
`branches`, `customers`, `channel_accounts`, `customer_identities`.

---

## Connection

| | |
|---|---|
| Supabase project | `uxthfnwcttdcbzchueox` |
| Dashboard key | **anon** key (browser) — read-only SELECT on `conversations` / `messages` |
| Tables touched | `messages`, `conversations` (+ joined: `branches`, `customers`, `channel_accounts`, `customer_identities`) |
| Writes | none — both changes are read/render only |
