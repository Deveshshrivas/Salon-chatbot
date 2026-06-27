# Takeover / Release — How It Works (tables, attributes, calls)

The **Takeover** button lets a staff member pause the bot and reply to the customer
themselves; **Release** hands the chat back to the bot. This explains the full path with
exact table names, columns, and the calls involved.

> Note: I did **not** modify the Takeover feature — this documents how it currently works.
> The only related dashboard changes in this session were image rendering, inbox sort, and
> the map-link fix.

---

## 1. What Takeover changes (the core idea)

A conversation has a **status** that decides who is "driving":

| `conversations.status` | Meaning | Bot replies? | Dashboard send mode |
|---|---|---|---|
| `active_bot` | bot is handling | yes | `simulate_message` (your text = customer msg, bot answers) |
| `awaiting_human` | escalated, waiting for staff | no | `send_message` (staff → customer) |
| `human_handling` | **staff took over** | no | `send_message` (staff → customer) |

Takeover = move `active_bot → human_handling`. Release = move back to `active_bot`.

---

## 2. The button → function chain (dashboard)

**File:** `Soaln-chatbot/app/conversations/page.jsx`

```
[Takeover] → handleTakeover() → freezeConversation(selected, null, 'staff_takeover')
[Release]  → handleRelease()  → resumeConversation(selected, 'resolved')
```

`handleTakeover()` also optimistically flips the local status to `human_handling`, refreshes
handover history, and reloads the list after 3s.

---

## 3. Why it goes through n8n (WF-3), not a direct DB call

**File:** `Soaln-chatbot/lib/supabase.js`

The browser uses the **anon** key, which **cannot** call the `freeze_conversation` /
`resume_conversation` RPCs (returns `PGRST202 function not found`). So the dashboard posts an
**action to the WF-3 webhook**, which runs server-side with the service-role key and also fires
the customer-facing handover steps via **WF-2**.

```js
freezeConversation(conv) → dashboardAction('freeze',  { conversation_id, wa_id, phone_number_id, channel, reason, priority })
resumeConversation(conv) → dashboardAction('resume',  { conversation_id, wa_id, phone_number_id, channel, resolution_outcome, notes })
```

`dashboardAction(action, params)` POSTs to:
```
https://n8n-bl1b.srv1675029.hstgr.cloud/webhook/neko-dashboard
(via /api/dashboard-action proxy, falling back to the webhook directly)
```
WF-3's `freeze` / `resume` actions run **Execute WF-2** (workflow id `Rgji1VKW9dMtia0n`), which
updates the DB and messages the customer.

---

## 4. Tables & attributes involved

### `conversations`  (the live state)
| Column | Type | Role in takeover |
|---|---|---|
| `id` | uuid | which chat |
| `status` | text | `active_bot` / `awaiting_human` / `human_handling` — **the switch** |
| `branch_id`, `customer_id`, `channel_account_id` | uuid | identity / routing |

### `handover_sessions`  (the audit log of each takeover)
| Column | Type | Role |
|---|---|---|
| `id` | uuid | session id |
| `conversation_id` | uuid | which chat |
| `employee_id` | uuid | who took over → joins `employees` |
| `reason` | text | e.g. `staff_takeover` |
| `started_at` | timestamptz | when takeover began |
| `ended_at` | timestamptz | when released (null while active) |
| `pre_summary` / `post_summary` | text | bot summary before / staff notes after |
| `priority` | text | `normal` etc. |
| `tags` | text[] | labels |

> Currently **0 rows** (no takeover has completed yet on this project).

### `employees`  (who the agent is)
| Column | used |
|---|---|
| `id` | join key `handover_sessions.employee_id` |
| `display_name` | shown in Handover History (mapped to `name` in UI) |

**Reads in the dashboard:**
```js
// Handover History panel
getHandoverHistory(conversationId):
  supabase.from('handover_sessions')
    .select('*, employees:employee_id (id, display_name)')
    .eq('conversation_id', id)
    .order('started_at', { ascending: false })
```

---

## 5. How sending changes after Takeover

**File:** `page.jsx → sendReply()`

```js
const replying = ['human_handling','awaiting_human'].includes(selected?.status)
const asCustomer = !replying
```

| Taken over? | `asCustomer` | WF-3 action | Effect |
|---|---|---|---|
| No (`active_bot`) | true | `simulate_message` | your text is treated as an **inbound customer** message → bot answers |
| Yes (`human_handling`) | false | `send_message` | your text is sent to the customer **as staff** (no bot) |

The optimistic bubble is inserted as `role:'user'/direction:'inbound'` (simulate) or
`role:'employee'/direction:'outbound'` (staff reply) into `messages`.

---

## 6. End-to-end flow

```
[Takeover click]
  page.jsx handleTakeover()
    → freezeConversation()
      → dashboardAction('freeze', {conversation_id, wa_id, channel, …})
        → POST WF-3 webhook /webhook/neko-dashboard
          → WF-3 'freeze' → Execute WF-2 (Rgji1VKW9dMtia0n)
             → UPDATE conversations.status = 'human_handling'
             → INSERT handover_sessions (reason='staff_takeover', started_at=now)
             → WF-2 notifies the customer a human is taking over
  ← dashboard sets status human_handling, shows [Release], switches send mode to send_message

[Release click]  → resumeConversation('resolved')
    → dashboardAction('resume', …) → WF-3 'resume' → Execute WF-2
       → UPDATE conversations.status = 'active_bot'
       → UPDATE handover_sessions.ended_at = now (post_summary/outcome)
  ← dashboard sets status active_bot, bot resumes
```

| Call | Where | Purpose |
|---|---|---|
| `dashboardAction('freeze' / 'resume')` | `lib/supabase.js` | POST action to WF-3 |
| WF-3 webhook `/webhook/neko-dashboard` | n8n | runs Execute WF-2 server-side |
| `conversations.status` | DB | the bot-vs-human switch |
| `handover_sessions` | DB | per-takeover audit log |
| `getHandoverHistory()` | `lib/supabase.js` | reads the log for the side panel |

---

## 7. Notes

- WF-3 is an **open webhook** (no auth; `x-dashboard-token` is ignored) and often returns
  HTTP 200 with an **empty body**, so the dashboard confirms results by re-reading
  `conversations` / `handover_sessions`, not by parsing the webhook response.
- If Takeover ever fails silently, check: (a) WF-3 is reachable, (b) WF-2 (`Rgji1VKW9dMtia0n`)
  is active, (c) `conversations.status` actually changed in the DB.
