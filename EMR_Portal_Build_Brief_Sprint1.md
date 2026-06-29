# EMR Portal — Build Brief for Claude Code
## Sprint 1: Users · Customers · Settings · Forms

---

## 1. Project Context

We are building **EMR Portal** — a multi-module SaaS suite for EMR Global, a transformer service company. The first module is **Field Management**. A second module, **Sales**, will be added later — so the architecture must support a module switcher and per-user module access from day one, even though only Field Management exists right now.

This is a real implementation project following an already-approved Scope of Work (SOW) and clickable HTML wireframes. This brief consolidates everything needed to start Sprint 1.

---

## 2. Tech Stack (confirmed, final)

- **Frontend:** Next.js (React) + TypeScript
- **Styling:** Tailwind CSS
- **Backend / DB / Auth:** Supabase (PostgreSQL, Supabase Auth, Supabase Storage)
- **Hosting (now):** Vercel (frontend) + Supabase (backend) — this is the MVP/initial hosting target
- **Hosting (later):** Will migrate to AWS (EC2 + RDS + S3) post-MVP. Note: RDS will be PostgreSQL to match Supabase, not MySQL, to avoid a database engine migration later.
- **Mobile app (future sprint):** React Native, built as an installable PWA fallback
- **Font:** Poppins (Google Fonts)
- **Theme colours:**
  - Primary maroon: `#7D1D3F`
  - Maroon dark: `#5A1229`
  - Maroon darker (sidebar bg): `#3A0A1C`
  - Maroon light/hover: `#A8294F`
  - Maroon pale (backgrounds): `#F9EEF2`
  - Maroon border: `#E8C5D0`
  - Grey light (page bg): `#F5F3F5`
  - Grey border: `#E5E0E3`
  - Text: `#1C0D14`
  - Text muted: `#7A6870`
  - Success green: `#059669`
  - Amber: `#D97706`
  - Blue: `#2563EB`
  - Red: `#DC2626`

---

## 3. Sprint 1 Scope

Build these 4 areas first. SAP integration, mobile app, Work Orders, Field Engineers, Products, and Product Requests come in later sprints — do **not** build them yet, but the data model should not actively conflict with their future existence (e.g. it's fine if `work_orders` table doesn't exist yet, but `users` and `customers` should be modeled sensibly knowing those will reference them later).

1. **Users module** — full CRUD, role-based access, module access control
2. **Customers module** — full CRUD
3. **Settings module** — branding, notification config, general settings
4. **Forms module** — a form builder (sections, fields, table/checklist blocks) — this is the most complex piece

---

## 4. Global Layout Requirements

### 4.1 Sidebar
- **Top brand block:** "EMR Portal" with subtitle "Suite", maroon icon (lightning bolt /  flash icon), dark maroon (`#3A0A1C`) background
- **Module switcher pill** directly below the brand:
  - Shows "Field Management" with an icon, currently the only real module
  - Clicking it opens a dropdown with:
    - "Field Management" — active, checkmarked
    - "Sales" — greyed out, disabled, badge reading "Coming soon"
  - This dropdown is decorative/non-functional for Sales right now (just needs to render and toggle open/close) — but the data model for module access (see Users section below) should be real
- **Nav sections** (don't reorder, this is final):
  - **Main:** Dashboard, Work Orders, Field Engineers *(stub pages with "Coming in next sprint" placeholder is fine for these for now — or simply don't render them in the nav until built, your call)*
  - **Management:** Users, Customers, Products *(Products = stub for now)*
  - **Operations:** Forms, Product Requests *(Product Requests = stub for now)*
  - **System:** Settings
- **User profile block** at the bottom of sidebar: avatar initials, name, role, dropdown with Edit profile / Change password / Logout

### 4.2 Topbar
- Page title (dynamic per page)
- Notification bell icon (static for now, no real notifications yet)
- User avatar + name + role on the right

### 4.3 Login
- Email + password only (no role selection at login — role is looked up after auth)
- "Forgot password" link (use Supabase password reset flow)
- No public self-registration — users are invite-only, created by an Admin via the Users module

---

## 5. Module 1 — Users

### 5.1 Roles (fixed list for now)
- Super Admin
- Service Manager
- Service Engineer
- Sales Executive Engineer
- Inventory Team
- Dispatch Team
- Reporting Team

### 5.2 Data model — `users` table (extends Supabase `auth.users`)
Create a `public.profiles` table (1:1 with `auth.users.id`):

```
profiles
- id (uuid, FK to auth.users.id, PK)
- first_name (text)
- last_name (text)
- employee_id (text, unique)
- email (text, unique) -- mirror of auth email for display/search convenience
- phone (text, nullable)
- department (text, nullable)
- role (text) -- one of the 7 roles above; use a Postgres enum or a roles lookup table
- is_active (boolean, default true)
- created_at (timestamptz, default now())
- last_login_at (timestamptz, nullable)
```

```
user_module_access
- id (uuid, PK)
- user_id (uuid, FK to profiles.id)
- module (text) -- 'field_management' | 'sales' (enum-style; only 'field_management' is usable today)
- created_at (timestamptz, default now())
```

### 5.3 UI — Users list page
- Search bar (name/email/employee ID)
- Filter by role, filter by status (Active/Inactive)
- Table columns: User (avatar+name+dept), Employee ID, Role (colour-coded badge), Department, Email, Phone, Last login, Status (Active/Inactive tag), Actions (View, Edit, Deactivate)
- "Roles & Permissions" button — opens a modal showing a static reference matrix of which role typically does what (this can be a simple read-only info table for now, doesn't need to drive real permission logic yet — but DO enforce role-based route/page access at minimum: e.g. only Super Admin and Service Manager can access Users and Settings pages)
- "Add User" button — opens Add User modal

### 5.4 UI — Add/Edit User modal
Fields:
- First name *(required)*
- Last name *(required)*
- Employee ID *(required, unique)*
- Email *(required, unique)* — used for Supabase Auth invite
- Phone
- Department
- Role *(required, dropdown of the 7 roles)*
- **Module access** *(required — at least one)*:
  - Checkbox: "Field Management" — checked by default, fully usable
  - Checkbox: "Sales" — disabled/greyed out, labeled "Coming soon" (do not let it be checked yet)
- On submit: create the Supabase Auth user via invite (magic link or temp password email), create the `profiles` row, create `user_module_access` row(s)
- Show a note: "Login credentials will be auto-generated and emailed to the user on account creation."

### 5.5 Deactivate flow
- Deactivating a user sets `is_active = false` and should also disable their Supabase Auth account (or at minimum block login at the app layer by checking `is_active` post-login and signing them out if false).

---

## 6. Module 2 — Customers

### 6.1 Data model — `customers` table

```
customers
- id (uuid, PK)
- name (text, required) -- organisation name
- type (text) -- 'sold' | 'shipped' | 'both'
- contact_person (text)
- designation (text, nullable)
- phone (text)
- email (text, nullable)
- whatsapp_number (text, nullable)
- sap_customer_code (text, nullable) -- for future SAP sync
- created_at (timestamptz, default now())
```

```
customer_sites
- id (uuid, PK)
- customer_id (uuid, FK to customers.id)
- site_name (text)
- site_address (text)
- created_at (timestamptz, default now())
```

```
transformers
- id (uuid, PK)
- customer_id (uuid, FK to customers.id)
- site_id (uuid, FK to customer_sites.id, nullable)
- serial_number (text, unique)
- rating (text, nullable) -- e.g. "100 KVA / 11 KV"
- manufacturer (text, nullable)
- year_of_manufacture (text, nullable)
- warranty_status (text) -- 'under_warranty' | 'expired' | 'amc'
- created_at (timestamptz, default now())
```

> Note: equipment rating and manufacturer fields were explicitly REMOVED from the "Add Customer" quick-create flow per client feedback — keep them in the `transformers` table/schema for later use (e.g. via Work Orders), but do NOT show them in the Add/Edit Customer modal UI.

### 6.2 UI — Customers list page
- Search bar
- Table columns: Customer (avatar/initials + name), Contact person, Phone, Email, Sites count, Serial numbers count, Last service (stub "—" for now, real value comes once Work Orders exist), Actions (View, Edit)
- "Add Customer" button

### 6.3 UI — Add/Edit Customer modal
Fields (this is the FINAL field list — confirmed with client, do not add equipment rating/manufacturer back in):
- Organisation name *(required)*
- Customer type (dropdown: Sold customer / Shipped customer / Both)
- Contact person *(required)*
- Phone *(required)*
- Email
- WhatsApp number
- Site address *(required)*
- Serial number
- Year of manufacture
- Warranty status (dropdown: Under warranty / Warranty expired / AMC)

### 6.4 UI — Customer detail view
- Contact info, summary stats (sites, transformers, total work orders — stub 0 for now)
- Transformer/serial number table
- Service history section (empty state: "No service history yet — work orders will appear here" until Work Orders module exists)

---

## 7. Module 3 — Settings

### 7.1 Sections (static config, store in a `settings` table or Supabase key-value table)

```
settings
- id (uuid, PK, single row or key-value pairs)
- org_name (text, default 'EMR Global')
- logo_url (text, nullable) -- Supabase Storage path
- theme_color (text, default '#7D1D3F')
- timezone (text, default 'Asia/Kolkata')
- date_format (text, default 'DD MMM YYYY')
- admin_email (text)
- whatsapp_api_key (text, nullable) -- store encrypted/secret, not plaintext in DB long-term; fine as placeholder field for now
- sms_gateway (text, nullable) -- 'twilio' | 'msg91' | 'textlocal'
- sms_api_key (text, nullable)
- sms_sender_id (text, nullable)
- updated_at (timestamptz)
```

### 7.2 UI — Settings page (4 cards/sections)
1. **Organisation branding** — logo upload (to Supabase Storage), live preview of sidebar brand block with uploaded logo
2. **Colour theme** — swatches: Maroon (default/selected), Navy, Forest, Graphite — selecting one should actually update a CSS variable / theme token app-wide (real functionality, not just visual)
3. **Notifications** — WhatsApp Business API key field, SMS gateway dropdown, SMS API key, Sender ID — "Save notification settings" button (just persists to DB for now, no live API validation needed yet)
4. **General settings** — Org name, timezone, date format, admin email — "Save settings" button

---

## 8. Module 4 — Forms (the form builder)

This is the most complex piece of Sprint 1. It must support building a form like the **MOM (Minutes of Meeting) / Pre-Commissioning Checklist** used by EMR Global field engineers.

### 8.1 Data model

```
forms
- id (uuid, PK)
- name (text, required) -- e.g. "MOM"
- job_type (text) -- 'site_inspection' | 'amc' | 'commissioning_activities' | 'supervision'
- status (text) -- 'draft' | 'active'
- field_count (int, computed or cached)
- created_at (timestamptz)
- updated_at (timestamptz)
```

```
form_sections
- id (uuid, PK)
- form_id (uuid, FK to forms.id)
- title (text) -- e.g. "Customer Information"
- order_index (int)
```

```
form_fields
- id (uuid, PK)
- section_id (uuid, FK to form_sections.id)
- label (text)
- field_type (text) -- 'text' | 'long_text' | 'number' | 'date' | 'dropdown' | 'photo' | 'signature' | 'checkbox'
- is_required (boolean, default false)
- prefill_from_job (boolean, default false) -- e.g. customer name auto-filled from the linked work order/customer
- read_only_on_mobile (boolean, default false)
- placeholder (text, nullable)
- help_text (text, nullable)
- order_index (int)
```

```
form_tables  -- for checklist/table-style blocks like the MOM observation tables
- id (uuid, PK)
- section_id (uuid, FK to form_sections.id)
- status_type (text) -- 'yes_no' | 'tested_not_tested' | 'checkbox_only'
- has_subrows (boolean, default false)
- order_index (int)
```

```
form_table_rows
- id (uuid, PK)
- table_id (uuid, FK to form_tables.id)
- parent_row_id (uuid, FK to form_table_rows.id, nullable) -- for sub-rows like (a), (b), (c) under a main numbered row
- row_label (text) -- the "Details" text, e.g. "Verification of switchyard cubicle panel erection was carried out"
- sno_label (text, nullable) -- "1", "(a)", "(b)" etc. — display label, not necessarily sequential int
- order_index (int)
```

> Submitted form *data* (actual filled-in values from a real job) is OUT of scope for Sprint 1 since Work Orders don't exist yet. Just build the form **definition/builder** — i.e. admins designing the form template. A `form_submissions` table can be added in the sprint where Work Orders + mobile app are built.

### 8.2 Seed data — build the MOM form as the first real seeded form

On first run / via a seed script, create exactly this form so the Forms list isn't empty and demonstrates the builder works:

**Form:** MOM — job_type: `commissioning_activities` — status: `active`

**Section 1: Customer Information**
- Customer Name (text, required, prefill_from_job: true)
- Contact Number (text, required, prefill_from_job: true)
- Installation Location (text, required, prefill_from_job: true)
- Project Details (long_text)

**Section 2: Transformer Details**
- NIFPS Serial No. (text, prefill_from_job: true)
- Rating (text, prefill_from_job: true)
- Manufacturer (text, prefill_from_job: true)
- Site Address (text, prefill_from_job: true)
- Date of Installation (date, required)
- Duration (text, required)

**Section 3: Detailed Observations & Activity Status** — table block, status_type: `yes_no`, has_subrows: false
Rows (sno_label / row_label):
1. "Verification of switchyard cubicle panel erection was carried out"
2. "Verification of signal box erection was carried out"
3. "Verification of control panel erection was carried out"
4. "Inspection of shutter valve erection along with cabling and termination was carried out"
5. "Inspection of arc sensor fixing, cabling and termination was carried out"
6. "Support pipe grouting work (under customer civil scope) was reviewed"
7. "LHD cable laying with conduit was checked"

**Section 4: Pre-Commissioning Checklist** — table block, status_type: `tested_not_tested`, has_subrows: true
- Row 1: "Earthing of the below switchyard equipment is to be verified" (main row, no own status)
  - Sub (a): "Cubicle panel"
  - Sub (b): "Control panel"
  - Sub (c): "Signal box"
- Row 2: "Potential-free contact assigned with the main protection relay was configured" (main row, no own status)
  - Sub (a): "Differential Protection Input (NO)"
  - Sub (b): "PRV Trip – (1) & (2) (NO)"
  - Sub (c): "Buchholz Trip (NO)"
  - Sub (d): "Master Trip Feedback – 86 Relay (NO)"
  - Sub (e): "Master Relay Trip Command – 110V / 220V"
- Row 3: "AC supply availability was verified in control panel" (own status, no sub-rows)
- Row 4: "DC cable availability was verified in control panel" (own status, no sub-rows)

**Section 5: Customer Sign-off**
- Customer Name (text, required)
- Designation (text)
- Digital Signature (signature, required)

field_count for this form = 36 (count all fields + table row "slots" — exact number isn't critical, just display something reasonable like the count of form_fields rows plus form_table_rows count)

### 8.3 UI — Forms list page
- Card-based grid (not a table) — one card per form
- Each card shows: form name, job type badge, field count, status badge (Active/Draft), last updated date
- Card buttons: **Assign**, Edit, Preview, Publish/Unpublish (Publish if draft, Unpublish if active)
- "Create Form" button top right

### 8.4 UI — Assign modal
- Small modal triggered by the "Assign" button on a form card
- Shows: info note explaining "When a work order of the selected job type is opened on the mobile app, this form will load automatically for the engineer to fill"
- Job type dropdown (Site Inspection / AMC / Commissioning Activities / Supervision) — pre-selected to the form's current `job_type`
- "Currently assigned to" readout showing current job_type + active status
- Save updates the form's `job_type` column

### 8.5 UI — Create/Edit Form modal (the builder) — the big one

Layout: large modal/full-screen panel, two-pane:

**Left pane — canvas** (scrollable):
- Renders the form as a series of **section cards**. Each section card has:
  - Dark maroon header bar with section title + edit/delete icons
  - Body containing either:
    - A list of **field rows** (drag handle, type icon, label, meta tags like "Pre-fill: Job data" / "Required" / type name, hover-revealed edit/delete icons), OR
    - A **table/checklist block** rendered as an actual mini-table with columns based on `status_type` (S.No | Details | Status columns | Remarks), showing main rows and indented sub-rows, with "+ Add row" / "+ Add sub-row" buttons
  - An "Add field" ghost button at the bottom of each section
- An "Add new section" ghost button at the very bottom of the canvas
- Clicking any field or table row selects it (visual highlight) and opens its properties in the right pane

**Right pane — palette / properties** (toggles between two states):
- **Default state (palette):** grid of field-type buttons (Text, Number, Long text, Dropdown, Date, Photo, Signature, Checkbox), buttons for "New section" and "Table/Checklist block", and a small reference card showing the 3 status types (Yes/No, Tested/Not Tested, Checkbox only)
- **Selected state (properties):** back arrow to return to palette, then: Field label input, Field type dropdown, toggles (Required field / Pre-fill from job data / Read-only on mobile), Placeholder text input, Help text input, Save + Delete field buttons

**Top of modal:**
- Form name input + Job type dropdown, inline in the header
- Two tabs: **Builder** | **Preview**

**Preview tab:**
- Renders the form as it would appear on the mobile app — phone-width centered column, EMR header block, sections rendered as actual fillable inputs (read-only/sample is fine) so admins can sanity-check the mobile experience before publishing

**Footer buttons:** Cancel, Save as draft, Preview on mobile (jumps to Preview tab), Publish form

This builder needs to actually **persist** to the `forms` / `form_sections` / `form_fields` / `form_tables` / `form_table_rows` tables — i.e. this is real CRUD, not just a static mockup. Adding a section should insert a row in Supabase; deleting a field should delete it; etc.

---

## 9. Reference Wireframe

A full interactive HTML/CSS/JS wireframe of this exact UI (colours, layout, copy, every modal) already exists and should be treated as the visual and interaction spec — match it closely rather than reinventing layouts. It is attached separately as `EMR_Global_Admin_Portal.html`. Open it in a browser to click through the entire intended experience before writing code.

---

## 10. Out of Scope for Sprint 1 (explicitly — do not build yet)

- Work Orders module
- Field Engineers module
- Products module (SAP-synced catalogue)
- Product Requests module (dispatch workflow)
- SAP integration (any direction)
- WhatsApp/SMS actually sending messages (just store config in Settings)
- Mobile app / PWA
- Form *submissions* (filled-in form data from real jobs) — only the form *builder/template* is in scope
- Real role-based permission matrix logic beyond basic page-level gating

---

## 11. Definition of Done for Sprint 1

- [ ] Next.js project scaffolded, deployed to Vercel, connected to a Supabase project
- [ ] Supabase Auth working — login, forgot password, invite-based user creation
- [ ] Sidebar with module switcher (Field Management active, Sales disabled/"Coming soon") matching wireframe
- [ ] Users: list, search/filter, add, edit, deactivate — with role + module access — all persisted to Supabase
- [ ] Customers: list, search, add, edit, detail view — all persisted to Supabase
- [ ] Settings: branding (logo upload to Supabase Storage), theme colour switch (functional), notifications config, general settings — all persisted
- [ ] Forms: list view, the MOM form fully seeded and viewable, full form builder (sections/fields/tables/sub-rows) with real persistence, Assign modal, Preview tab
- [ ] Basic role-based page access (e.g. only Super Admin/Service Manager can reach Users & Settings)
- [ ] Deployed, working URL on Vercel that the client can click through
