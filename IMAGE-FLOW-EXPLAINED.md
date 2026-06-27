# How Promotion & Before/After Images Reach the Dashboard

End-to-end data lineage with exact **table names** and **attributes (columns)** at every stage.
Supabase project: `uxthfnwcttdcbzchueox`.

```
Storage bucket  ──►  Source table        ──►  Bot builds attachments[]  ──►  messages.metadata (jsonb)  ──►  Dashboard renders
(promo_images)      (promotions /             (wf1.json brain)               (bot_turn_finalize RPC)         (page.jsx MessageBubble)
                     salon_media)
```

I did not "add" the images — they already live in Supabase. The dashboard simply now **reads every image** the bot recorded on the message. Below is exactly where each one comes from.

---

## Stage 1 — Where the image files physically live (Supabase Storage)

| Bucket | Public path example | Holds |
|---|---|---|
| `promo_images` | `…/storage/v1/object/public/promo_images/1782360733289_ktha39.jpg` | promotion + before/after photos |
| `salon_media` | `…/storage/v1/object/public/salon_media/deposit/qr_deposit_ladprao.jpg` | QR codes, size charts, library media |
| `chat_uploads` | `…/storage/v1/object/public/chat_uploads/…` | staff-uploaded images |

A column like `image_url` just stores the full public URL into one of these buckets.

---

## Stage 2 — Source tables & the exact columns that hold the URLs

### Table `promotions`  (this is where promotion + before/after come from)

| Column | Type | Becomes which image |
|---|---|---|
| `image_url` | text | the **promotion** photo |
| `before_image_url` | text | the **Before** photo |
| `after_image_url` | text | the **After** photo |
| `title_th` | text | promo title (card text) |
| `promo_price` | numeric | promo price (card text) |
| `regular_price` | numeric | crossed-out original (card text) |
| `target_branches` | uuid[] | which branches the promo applies to |
| `service_slug` / `service_category` | text | which service it belongs to |
| `is_active` | bool | only active promos are offered |

**Real row used in your chat** (promotion `f5096c03-2875-47ce-8040-8a2b6e1c6738`):
```
image_url        = promo_images/1782360733289_ktha39.jpg   → promotion image
before_image_url = promo_images/1782360708338_om42ce.jpg   → Before image
after_image_url  = ""  (empty → no After image sent)
promo_price=1200, regular_price=2000
```

### Table `salon_media`  (QR, size charts, and library before/after)

| Column | Type | Use |
|---|---|---|
| `media_type` | text | `deposit_qr`, `size_chart`, etc. |
| `image_url` | text | main image URL |
| `before_url` | text | Before (library, currently unused — 0 rows) |
| `after_url` | text | After (library, currently unused) |
| `service_slug` / `branch_slug` | text | matching scope |
| `storage_bucket` / `storage_path` | text | where the file lives |

> Note: `salon_media` currently has **no** before/after rows, so before/after images come from `promotions.before_image_url` / `after_image_url`.

---

## Stage 3 — The bot brain turns those columns into `attachments[]`  (`wf1.json`)

In the brain, the node that parses the LLM decision (`14 Set: Parse LLM-1 JSON`) builds an
`attachments` array, mapping **source column → attachment object**:

| Source column | → attachment `type` | attachment `url` |
|---|---|---|
| `promotions.image_url` | `promotion` | that URL |
| `promotions.before_image_url` | `before_after_before` | that URL |
| `promotions.after_image_url` | `before_after_after` | that URL |
| `salon_media.image_url` (deposit) | `deposit_qr` | that URL |
| `salon_media.image_url` (size) | `image` (size chart) | that URL |

Each attachment looks like:
```json
{ "url": "…promo.jpg", "type": "promotion", "label": "โปรโมชัน", "promotion_id": "f5096c03…" }
```

---

## Stage 4 — Saved into the `messages` table (`bot_turn_finalize` RPC, node `23`)

The brain calls RPC `bot_turn_finalize` with `p_bot_message_metadata`, which writes into:

**Table `messages`**

| Column | Type | Holds |
|---|---|---|
| `metadata` | **jsonb** | the whole attachment object (below) |
| `content_text` | text | the bot's reply text |
| `role` | text | `bot` |
| `direction` | text | `outbound` |
| `conversation_id` | uuid | which chat |
| `created_at` | timestamptz | when |

**What lands in `messages.metadata` (real example):**
```json
{
  "type": "promotion",
  "url":  "…promo.jpg",
  "attachments": [
    { "url": "…promo.jpg",  "type": "promotion" },
    { "url": "…before.jpg", "type": "before_after_before", "label": "Before" }
  ],
  "first_attachment": { "url": "…promo.jpg", "type": "promotion" },
  "attachment_count": 2
}
```
👉 **`metadata.attachments[]` is the key** — it holds **every** image for that message.

---

## Stage 5 — The dashboard reads & renders (`Soaln-chatbot/app/conversations/page.jsx`)

**Reads** (via `getMessages()` → `SELECT * FROM messages WHERE conversation_id = …`):

| Table | Column | Used for |
|---|---|---|
| `messages` | `metadata` (jsonb) | the images |
| `messages` | `content_text` / `content` | bubble text |
| `messages` | `role`, `direction` | bot vs customer side/color |
| `messages` | `created_at` | timestamp |

**Inside `metadata` it reads:** `attachments[].url` (and `.image_url`, `.type`); fallbacks `metadata.url`, `metadata.image_url`, `metadata.first_attachment.url`; and `title`/`price`/`original` for the promo card text.

**Render logic (new):** loop over **all** of `metadata.attachments[]` and show every image — so promotion **and** Before **and** After all appear, not just the first.

```js
const attImages = (() => {
  if (!att || typeof att !== 'object') return []
  const out = []
  const push = (u) => { if (typeof u === 'string' && u.trim() && !out.includes(u)) out.push(u.trim()) }
  const skip = (t) => t === 'location' || t === 'link' || t === 'map'
  if (Array.isArray(att.attachments)) {
    for (const a of att.attachments) {
      if (a && typeof a === 'object' && !skip(a.type)) push(a.url || a.image_url)
    }
  }
  if (out.length === 0 && !skip(att.type)) push(att.url || att.image_url || att.first_attachment?.url)
  return out
})()
// render: {attImages.map((u, i) => <img key={i} src={u} ... />)}
```

---

## Summary table — one image's journey

| Stage | Table / location | Attribute |
|---|---|---|
| 1. File | bucket `promo_images` | object path |
| 2. Catalog | `promotions` | `image_url`, `before_image_url`, `after_image_url` |
| 3. Brain builds | (in-memory `attachments[]`) | `{ url, type }` |
| 4. Saved | `messages` | `metadata` (jsonb) → `attachments[].url` |
| 5. Shown | dashboard `MessageBubble` | reads `messages.metadata.attachments[].url` |

> Reminder: bot images only appear after (a) the fixed `wf1.json` is re-imported so the bot saves messages, and (b) the dashboard is rebuilt + redeployed.
