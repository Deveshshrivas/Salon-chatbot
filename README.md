# Neko Salon — Studio Dashboard

A Next.js (App Router) admin dashboard for the Neko Salon WhatsApp/Messenger bot system. Built on top of the existing Supabase backend (project `gopnobeclxmhaelysvlp`) and the n8n workflows **WF-2 (Handover)** + **WF-3 (Dashboard API)**.

This dashboard is the salon-focused descendant of the Class Clinic Dashboard — same core patterns (Inbox, branches, promotions, employees, settings), redesigned around the salon's data model and aesthetic.

---

## Stack

- **Next.js 14** App Router, JavaScript, Tailwind CSS
- **Supabase JS** for direct reads + RPCs
- **n8n** for WhatsApp message sending, handover triggers, and a few server-side actions

Fonts: Playfair Display + Inter. Palette: rose + ink-charcoal on a cream canvas.

---

## Pages

| Route | Purpose |
|---|---|
| `/` | Overview — stats, pending handovers, recent conversations |
| `/conversations` | Inbox — take over chats, send WhatsApp replies, attach images/promos/media |
| `/bookings` | Today/upcoming/past appointments; status changes; cancel; **upload payment proof** |
| `/branches` | CRUD branches, weekly hours, per-branch policy config, aliases |
| `/stylists` | CRUD stylists with photo, specialties, weekly schedule |
| `/services` | CRUD services with per-branch pricing (Nakhon Pathom + Ladprao) |
| `/promotions` | CRUD time-bound campaigns with poster + before/after images |
| `/before-after` | Upload and tag before/after + gallery shots (filterable by service, branch, gender, style) |
| `/employees` | CRUD dashboard staff with roles, branch access, notification routing |
| `/settings` | System status, maintenance RPCs, connection info, bucket list, RLS warning |

---

## Setup

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_N8N_WEBHOOK_URL,
# NEXT_PUBLIC_DASHBOARD_TOKEN, NEXT_PUBLIC_ADMIN_PASSWORD
```

### 3. Database

The migrations have already been applied to the project. You don't need to run anything manually.

For reference, the migrations that this dashboard depends on:

- `add_get_employee_for_notify_rpc` — helper for WF-2
- `add_dashboard_rpcs` — `dashboard_summary`, `dashboard_list_conversations`, `dashboard_get_conversation`, `dashboard_list_bookings`, `dashboard_log_staff_message`
- `add_payment_proof_and_storage_buckets` — adds `payment_proof` enum value to `salon_media_type`, two new columns on `bookings` (`payment_proof_url`, `payment_proof_uploaded_at`), and creates the new storage buckets
- `add_salon_dashboard_rpcs` — upsert/delete RPCs for branches, stylists, services, promotions, media, plus `dashboard_attach_payment_proof`

### 4. Storage buckets

All public buckets the dashboard writes to are already created:

| Bucket | Used by |
|---|---|
| `salon_media` | Bot media library |
| `promo_images` | `/promotions` poster, before, after |
| `stylist_photos` | `/stylists` profile photos |
| `before_after` | `/before-after` gallery |
| `chat_uploads` | `/conversations` staff attachments |
| `payment_proofs` | `/bookings` payment screenshots |
| `logos` | brand assets |

### 5. n8n workflows

Two workflow JSONs need to be imported (delivered separately in this thread):

1. **WF-2 — Handover** — sub-workflow with two paths (A = freeze, B = resume)
2. **WF-3 — Dashboard API** — webhook called by this dashboard

After importing WF-2, copy its workflow ID and paste it into WF-3's two `Execute WF-2` nodes (currently set to `REPLACE_WITH_WF2_ID`).

Set these env vars in n8n:

- `WA_ACCESS_TOKEN` — WhatsApp Cloud API access token
- `DASHBOARD_TOKEN` — must equal `NEXT_PUBLIC_DASHBOARD_TOKEN` in this dashboard

### 6. Run

```bash
npm run dev
```

Open <http://localhost:3000> and enter the admin password.

---

## Architecture notes

### Direct RPCs vs. webhook router

Most pages call Supabase RPCs **directly** using the anon key (read + SECURITY DEFINER RPCs). The n8n webhook router (`dashboardAction()` in `lib/supabase.js`) is reserved for actions that need server-side work:

- **`send_message`** — needs the WhatsApp Cloud API HTTP call, so it goes through n8n
- **`freeze` / `resume`** — Inbox uses RPC helpers directly (`freezeConversation`, `resumeConversation`), but the webhook also exposes these for external callers

This keeps the dashboard responsive and reduces n8n load.

### Soft deletes

All "delete" buttons set `is_active = false` and preserve history. Hard delete only happens in the conversation delete flow (which also wipes customer data if no other conversations exist).

### Payment proof flow

1. Staff opens a booking in `/bookings`
2. Clicks the upload area in the right-hand detail panel
3. Image goes to the `payment_proofs` bucket via `ImageUploader`
4. `dashboard_attach_payment_proof(booking_id, proof_url)` is called
5. `bookings.payment_proof_url` is set, `payment_proof_uploaded_at` stamped, and `deposit_status` auto-bumps from `pending`/`not_required` → `paid`

### Salon vs. clinic schema differences

The clinic dashboard expected fields like `branches.branch_id`, `conversations.clinic_id`, `messages.role = 'user'`, etc. This dashboard uses the salon schema:

- `branches.id` (not `branch_id`) and `branches.slug`
- `conversations.branch_id` (uuid foreign key)
- `messages.role IN ('customer','bot','employee')` and `messages.content_text` (not `content`)
- `customer_identities` links customers to channels (WA / Messenger) instead of LINE-only `line_user_id`
- Two-branch flat pricing on `services` (Nakhon Pathom + Ladprao columns) instead of nested branch pricing

### ⚠ RLS

19 public tables have **Row Level Security disabled**. The dashboard works because it uses the anon key with no policies enforced. Before production, enable RLS and write policies appropriate for the dashboard's audience (or move all dashboard reads behind a server-side proxy with the service-role key). See the warning banner on `/settings`.

---

## File map

```
app/
├── globals.css            — fonts + bubble styles + texture
├── layout.jsx             — sidebar nav + AuthGate
├── page.jsx               — Overview
├── conversations/page.jsx — Inbox
├── bookings/page.jsx      — Bookings + payment proof
├── branches/page.jsx      — Branch CRUD + hours + policies + aliases
├── stylists/page.jsx      — Stylist CRUD + photo + schedule
├── services/page.jsx      — Service catalog with per-branch pricing
├── promotions/page.jsx    — Promotion campaigns
├── before-after/page.jsx  — Gallery management
├── employees/page.jsx     — Staff CRUD + role + notify channel
└── settings/page.jsx      — Health, maintenance, RLS warning
components/
├── AuthGate.jsx           — sessionStorage password gate
└── ui.jsx                 — Field, Toggle, Button, Card, StatusPill, ImageUploader, EmptyState, Tabs
lib/
└── supabase.js            — client + helper functions
```

---

## License

Internal use only.
