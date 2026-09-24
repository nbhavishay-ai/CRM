# ORVION — Enterprise Full-Stack Web CRM

> **Brand Philosophy**: *"Every Lead. Every Update. Every Day. Nothing Left Behind."*  
> **Primary Objective**: No lead should ever be lost, forgotten, duplicated, or left without accountability.

ORVION is a production-quality enterprise CRM application built from scratch with a clean, decoupled architecture. It separates **Current State** from **Immutable History**, enforcing 100% auditable ownership, atomic reassignments, and zero silent overdue leads.

---

## 🌟 Architecture & Core Principles

```
orvion/
├── app/
│   ├── (auth)/login/               # Enterprise authentication & persona switcher
│   ├── (dashboard)/
│   │   ├── admin/                  # Control Center, All Leads, NA/NI/CP/Other queues, Teams, Users, Audit, Sync
│   │   ├── team-lead/              # Team Dashboard, VIEW TEAM WORKFLOW, Member Workspace inspection
│   │   ├── executive/              # "What do I need to do today?", Today's Leads, Calling Data, Workspace
│   │   ├── leads/[id]/             # Master Lead Detail ("ONE LEAD = ONE COMPLETE STORY")
│   │   ├── meetings/               # Client Meetings scheduler, outcome logger
│   │   └── reports/                # Conversion Funnel & Executive productivity (Recharts)
│   └── api/                        # Mobile-ready REST API endpoints
├── components/
│   ├── layout/                     # Role-aware Sidebar, Topbar with Real-time Sync & Notifications
│   ├── leads/                      # LeadCard, LeadTable, NewLeadModal, LeadUpdateModal, ReassignModal
│   ├── timeline/                   # Chronological Lead Story Timeline
│   └── ui/                         # Badge, Button, Modal
├── lib/
│   ├── db.ts                       # Prisma Client singleton
│   ├── auth.ts                     # JWT authentication, bcrypt hashing & Bearer token support
│   ├── permissions.ts              # Role-Based Access Control (RBAC)
│   └── lead-number.ts              # Permanent sequential ORV-000001 generator
├── services/                       # Isolated business logic layer
│   ├── lead.service.ts             # CRUD, server filtering, pagination, attention metrics
│   ├── assignment.service.ts       # Atomic Prisma transactions for reassignment
│   ├── followup.service.ts         # Overdue calculation & Calling Data engine
│   ├── meeting.service.ts          # Meeting lifecycle management
│   ├── audit.service.ts            # Immutable audit logging
│   └── report.service.ts           # Real database analytics
├── prisma/
│   ├── schema.prisma               # Relational schema with indexes & foreign keys
│   └── seed.ts                     # Enterprise test data & multi-hop reassignment chains
└── tests/
    └── crm-core.test.ts            # Automated tests for business rules
```

---

## 🔑 Pre-Seeded Employee Personas

All accounts use the password: **`Password@123`**

| Role | Name | Email | Scope |
| :--- | :--- | :--- | :--- |
| **MAIN ADMIN** | Vikramaditya Singhania | `admin@orvion.com` | Full company-wide control, all leads, teams, audit, sync |
| **TEAM LEAD 1** | Rajesh Mehra | `rajesh@orvion.com` | Supervises Alpha Strategic Sales team & member workflows |
| **TEAM LEAD 2** | Ananya Deshmukh | `ananya@orvion.com` | Supervises Bravo Commercial & Retail team |
| **EXECUTIVE 1** | Rahul Sharma | `rahul@orvion.com` | Team Alpha active lead workspace & calling schedule |
| **EXECUTIVE 2** | Amit Verma | `amit@orvion.com` | Team Alpha active lead workspace |
| **EXECUTIVE 3** | Priya Patel | `priya@orvion.com` | Team Bravo active lead workspace |
| **EXECUTIVE 4** | Karan Mehta | `karan@orvion.com` | Team Bravo active lead workspace |

---

## 🚀 Quick Launch & Development

### 1. Install Dependencies
```bash
bun install
# or npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/orvion?schema=public"
JWT_SECRET="generate-a-unique-random-secret"
NEXT_PUBLIC_APP_NAME="ORVION"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 3. Initialize Database & Seed
```bash
# Apply reviewed PostgreSQL migrations
bunx prisma migrate deploy

# Provision initial accounts and seed data explicitly
bun run seed
```

### 4. Run Development Server
```bash
bun run dev
```
Open **http://localhost:3000** in your browser.

---

## 🧪 Automated Business Rule Tests

Run the automated test suite verifying core CRM invariants:
```bash
bun test
```

Verified rules:
1. **Multi-hop Reassignment Chain**: `Rahul → Amit → Priya → Karan → Rahul` preserves permanent Lead ID, generates unbroken assignment logs, and marks lead as **NEW TO ME** for recipient.
2. **Not Answering (NA) Isolation**: Marking NA removes lead from active workspace and shifts it into Admin NA triage queue with full remark history.
3. **Immutable Remarks History**: Successive updates never overwrite previous remarks.
4. **Strict RBAC Isolation**: Executives cannot access peer leads; Team Leads cannot cross into other teams.
5. **Real Attention Metrics**: Admin counts (unassigned, overdue follow-ups, without next action) derive directly from database aggregates.

---

## 📱 Future Mobile App Integration

The backend is built from day one to power both the Web CRM and the upcoming Mobile App:
- **Shared Authentication**: Endpoints accept both standard **HttpOnly cookies** (web) and **`Authorization: Bearer <token>`** headers (mobile).
- **Decoupled Services**: Business logic lives strictly in `services/`, not inside React components.
- **RESTful Endpoints**: Full API surface available under `/api/*`.

---

## ☁️ Vercel & Production Deployment

To deploy to Vercel with PostgreSQL (Supabase, Neon, or Railway):
1. Set `DATABASE_URL`, `JWT_SECRET`, and `NEXT_PUBLIC_APP_URL` in Vercel project settings.
2. Run reviewed migrations separately with `prisma migrate deploy` before starting the application.
3. Build command: `prisma generate && next build`. Builds never mutate or seed the database.
