# Fix: Raw Google Maps URL Shown as a Wall of Text

The bot reply showed a giant percent-encoded string like
`…%E0%B8%99…/@13.7683628,100.597964,17z/data=!3m1!4b1!…` instead of a clean link.
This documents what it was, where the data comes from (table + attribute), and how the fix works.

---

## 1. The problem

In a chat bubble, a bot message rendered a long, URL-encoded **Google Maps** link as plain
text. The dashboard printed `content_text` verbatim (`white-space: pre-wrap`), so the URL
wrapped into an unreadable block.

---

## 2. Where that URL comes from (table + attribute)

| Stage | Table / location | Attribute (column) | Value |
|---|---|---|---|
| Source of truth | **`branches`** | **`google_maps_url`** | `https://www.google.com/maps/place/Neko+Salon+2+%E0%B9%…/@13.7683628,100.597964,17z/data=…` |
| (also available) | `branches` | `latitude`, `longitude` | `13.7683628`, `100.597964` |
| Bot appends it | brain `wf1.json` node `20a Code: Final Text` | builds reply text | `…📍 แผนที่สาขา: <branches.google_maps_url>` |
| Saved | **`messages`** | **`content_text`** (text) | the reply text **with the raw URL inside it** |
| Shown | dashboard `MessageBubble` | renders `content_text` | previously printed as-is → wall of text |

> Key point: the map link is **inside `messages.content_text`**, NOT in `messages.metadata`.
> So it is plain text, and the image/attachment renderer never touches it.

**Lineage:** `branches.google_maps_url` → (bot puts it into) → `messages.content_text` → (dashboard prints) → bubble.

---

## 3. The fix (dashboard only)

**File:** `Soaln-chatbot/app/conversations/page.jsx`

Added a helper `renderTextWithLinks(text)` that scans the message text for `http(s)` URLs and
renders each as a short clickable link instead of raw characters. Google-Maps-style URLs get a
friendly label `📍 เปิดแผนที่ (Open map)`; any other URL shows `🔗 <hostname>`.

```js
function renderTextWithLinks(text) {
  const parts = String(text).split(/(https?:\/\/[^\s]+)/g)
  return parts.map((part, i) => {
    if (!/^https?:\/\//.test(part)) return part            // plain text, unchanged
    const isMap = /google\.[^/]+\/maps|\/maps\/|[?&]q=-?\d|\/@-?\d/.test(part)
    let host = ''
    try { host = new URL(part).hostname.replace(/^www\./, '') } catch (e) {}
    const label = isMap ? '📍 เปิดแผนที่ (Open map)' : `🔗 ${host || 'link'}`
    return <a key={i} href={part} target="_blank" rel="noreferrer"
              className="underline text-rose-600 break-all">{label}</a>
  })
}
```

**Render change:**
```diff
- {text && <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>}
+ {text && <p style={{ whiteSpace: 'pre-wrap' }}>{renderTextWithLinks(text)}</p>}
```

**Result:** the surrounding Thai sentence stays as text; the long maps URL becomes a single
clickable **📍 เปิดแผนที่ (Open map)** link.

---

## 4. How everything is "called" (data flow / queries)

```
branches.google_maps_url
   │  (read by the bot brain)
   ▼
wf1.json  node "20a Code: Final Text"  → appends "📍 แผนที่สาขา: <url>" to the reply
   │  (saved via RPC bot_turn_finalize → p_bot_message_text)
   ▼
messages.content_text          ← INSERT by RPC `bot_turn_finalize`
   │
   ▼  dashboard read:
getMessages(conversationId)  →  supabase.from('messages').select('*')
                                  .eq('conversation_id', id)
                                  .order('created_at', { ascending:false })
   │
   ▼  render:
MessageBubble → renderTextWithLinks(msg.content_text)  → clickable 📍 link
```

| Call | Where | What it does |
|---|---|---|
| `branches.google_maps_url` | Supabase REST `…/rest/v1/branches?select=google_maps_url` | source URL |
| `bot_turn_finalize(p_bot_message_text)` | RPC `…/rest/v1/rpc/bot_turn_finalize` | writes the text (with URL) into `messages` |
| `getMessages()` | `lib/supabase.js` → `from('messages').select('*')` | reads the row (anon key) |
| `renderTextWithLinks()` | `app/conversations/page.jsx` | turns the URL into a link |

---

## 5. Notes / optional follow-up

- This is a **display-only** fix — no table or bot change required, and no DB write.
- Cleaner long-term option (bot side, optional): instead of pasting `google_maps_url` into the
  reply **text**, emit it as a `metadata` attachment of `type: 'link'` (or `'map'`) with a label.
  The dashboard already renders `att.type === 'link'` as a tidy link, and `content_text` stays clean.
- Needs the usual dashboard **rebuild + redeploy** to go live.
