# Remote Workforce SaaS — Product Spec & MVP Roadmap

Last updated 14 Oct 2026. The living version, with diagrams, is the claude.ai doc "Remote Workforce SaaS — Product Spec & MVP Roadmap".

## Overview

A SaaS that lets companies see whether their remote workers are actually working: hours worked, activity while clocked in, tasks completed, and team communication in one place. The first version ships time tracking, activity monitoring and tasks; chat, leave and payroll follow.

**Positioning.** Hubstaff, Time Doctor and Insightful lead this market today. Our edge:

- **Built for African remote workers.** An offline-first agent that survives network drops and power outages, with low data use.
- **Dual pricing.** A naira price Nigerian SMEs can afford, and a competitive USD price for foreign employers.
- **Output next to activity.** Dashboards show tasks done beside hours active, so good workers are judged fairly and activity-gaming is easy to spot.

## Customers and roles

Nigeria and Africa come first, then foreign companies. Nigerian companies with staff abroad are a core case.

| Segment | Buyer | Cares about | Pays in |
| --- | --- | --- | --- |
| Nigerian SMEs and agencies | Founder, ops or HR lead | Price, proof staff are working, simple setup | NGN |
| Foreign companies hiring remote talent | Founder, team lead, agency owner | Hours to bill clients, trust across time zones, GDPR | USD |
| Outsourcing / BPO firms | Operations manager | Many workers, shifts, client reports | NGN or USD |

| Role | Can do |
| --- | --- |
| Platform super admin (us) | See all companies, plans and usage; suspend accounts; support |
| Owner | Billing, plan, settings, everything below |
| Admin / HR | Invite and remove workers, set tracking policy, see all data |
| Manager | See and manage their own team's time, activity and tasks |
| Worker | Clock in and out, track time on tasks, see their own data |

## Modules

| # | Module | Phase |
| --- | --- | --- |
| 1 | Core and accounts: sign-up, workspace, invites, roles, teams, profiles, time zones | MVP (done: Week 1) |
| 2 | Time tracking: desktop clock in/out, sessions, breaks, timesheets, manual time requests | MVP |
| 3 | Activity monitoring: active vs idle, activity % per 10-minute block, idle prompt, apps and websites | MVP |
| 4 | Tasks and projects: tasks, assignees, status, comments, time per task, daily work report | MVP |
| 5 | Screenshots: random every 10–20 min, blur, per-company on/off, retention by plan | Phase 2 |
| 6 | Chat and groups, announcements, online status, notifications | Phase 2 |
| 7 | Productivity insights: app labels per role, reports, output vs activity, digests | Phase 2 |
| 8 | Billing: per-seat plans, Paystack (NGN), USD checkout, invoices, trials | Phase 2 |
| 9 | Leave and requests: types, balances, approvals, holidays per country | Phase 3 |
| 10 | Payroll and performance: hours × rate exports, PAYE/pension add-on, KPIs, reviews, API | Phase 4 |

## MVP scope

The MVP answers one question for a manager: "Who worked today, for how long, how actively, and on what?"

- Company sign-up, invites, roles, teams, worker profiles with time zone and expected hours ✅
- Desktop agent (Windows and macOS): login, clock in/out ✅ (current task: Week 7)
- Idle detection with a "were you working?" prompt, and activity % per 10-minute block ✅
- App and window-title tracking ✅
- Offline queue that syncs when the internet returns ✅
- Dashboard: who is online now, today's hours, activity %, top apps ✅
- Timesheets by day and week, CSV export ✅
- Projects and tasks, time per task, daily work report at clock-out
- Company tracking settings ✅, consent screen in the agent ✅, and a worker "My activity" page ✅

Left out of the MVP: screenshots, chat (pilots use WhatsApp), billing (manual invoicing), mobile app, Linux agent, leave, payroll.

**Done means:** a pilot company with 10 workers runs it for a full week, and the owner trusts the timesheet without asking anyone.

## Architecture

There is one Supabase project and no separate API server in the MVP.

- **Desktop agent (Electron):** uploads batches via the `ingest_batch()` database function every 2–3 min.
- **Web dashboard (Next.js on Vercel):** talks to Supabase with `@supabase/ssr`; RLS filters every query.
- **Supabase:**
  - Postgres with RLS
  - Auth
  - Realtime (Presence for online status, chat later)
  - Storage (screenshots, with the same RLS)
  - `pg_cron` (rollups, retention cleanup)
  - Edge Functions (emails, Paystack webhooks)
- **Mobile (React Native / Expo):** Phase 2.
- **Email:** a transactional provider (e.g. Resend) configured as Supabase SMTP before launch.

## Data model (MVP)

Every table carries `organization_id` with RLS; timestamps are in UTC.

| Table | Purpose | Status |
| --- | --- | --- |
| organizations | Company, country, time zone, currency, plan, settings (jsonb tracking policy) | ✅ |
| profiles | One per auth user: email, full name | ✅ |
| memberships | User ↔ company: role, status, team, time zone, expected hours | ✅ |
| teams | Name, manager | ✅ |
| invitations | Email, role, team, token, expiry | ✅ |
| audit_logs | Who changed what | ✅ |
| devices | One per installed agent; revocable | ✅ |
| work_sessions | Clock-in to clock-out | ✅ |
| time_entries | A session split by task | Week 7 |
| activity_blocks | 10-minute blocks: active, idle and removed seconds (never keystrokes) | ✅ |
| app_usage | App, domain, title, seconds | ✅ |
| idle_periods | Away-from-computer stretches and the worker's keep/remove answer | ✅ |
| projects, tasks, task_comments, daily_reports, manual_time_requests | Tasks and reports | Week 7 |

## Desktop agent design

1. Every 10 s, read `powerMonitor.getSystemIdleTime()`. Less than 10 s idle counts as 10 active seconds.
2. Active seconds and input counts roll into the current 10-minute block. Activity % = active ÷ clocked-in seconds for that block.
3. Idle beyond the company timeout (default 5 min) is marked idle. On return the worker chooses: keep as work (with a reason) or discard.
4. Every few seconds, record the active app and window title, merging repeats into spans.
5. Everything goes to a local SQLite queue first. Upload every 2–3 min with an idempotency key, so retries never double-count.

**Integrity:**
- A heartbeat every minute, so an agent killed mid-session shows as a gap.
- Server time is the source of truth, and the agent's clock offset is recorded.
- A per-device token is stored with `safeStorage`; admins can revoke a device.
- Later: detect mouse-jiggler patterns.

**Privacy:** visible tray icon, nothing runs outside clocked-in time, no keystroke content.

**Shipping:**
- Auto-update with `electron-updater`.
- Windows needs a code-signing certificate.
- macOS needs an Apple Developer account, notarization, and Accessibility / Screen Recording permissions.

## Pricing (proposal, to test with pilots)

| Plan | Includes | NGN / user / month | USD / user / month |
| --- | --- | --- | --- |
| Basic | Time tracking, idle detection, timesheets, tasks, daily reports | ₦2,000 | $4 |
| Pro | + apps and websites, productivity reports, chat | ₦3,500 | $7 |
| Business | + screenshots, leave, payroll exports, audit log, API | ₦5,500 | $10 |

Every plan starts with a 14-day trial of Pro. Seats are counted as active workers in the billing period.

**Payments:**
- NGN: Paystack, with 7.5% VAT on invoices.
- USD: a merchant of record (Paddle / Lemon Squeezy). Confirm they onboard Nigerian sellers first.

## Privacy and compliance

The laws that apply are Nigeria's NDPA 2023 and GDPR / UK GDPR.

**Product rules:**
- A consent screen listing exactly what is tracked.
- Tracking only while clocked in.
- A "My data" page for workers.
- No keystroke content, webcam or microphone.
- Screenshots off by default for EU/UK companies.
- Retention limits by plan.
- Owners can export or delete company data.

**Before charging:** privacy policy, terms of service, DPA, a "what we track" notice, and a short review by a Nigerian data-protection lawyer.

## Roadmap (solo, about 10 weeks to pilots)

| When | Milestone |
| --- | --- |
| Week 1 ✅ | Foundation: monorepo, auth, sign-up, invites, roles, RLS |
| Weeks 2–4 ✅ | Desktop agent: clock in/out, idle prompt, activity blocks, app tracking, offline sync (built; first run on Windows pending) |
| Weeks 5–6 ✅ | Dashboard and timesheets: who is online, per-person day view, weekly timesheets, CSV export |
| Week 7 | Tasks: projects, tasks, comments, time per task, daily report |
| Week 8 | Launch-ready: consent screen, My data page, signed installers, auto-update |
| Weeks 9–10 | Pilot with 3–5 companies (recruit from week 4) |
| End of week 10 | **MVP gate:** 10 workers use it for a full week and the owner trusts the timesheet |
| Months 4–5 | Phase 2, paid launch: screenshots, chat, billing (NGN + USD), productivity reports |
| Month 6+ | Phase 3, HR basics: mobile app, leave, holidays per country, Linux agent |
| Later | Phase 4: payroll exports, PAYE/pension add-on, KPIs, reviews, public API |

## Open decisions and risks

**Decisions:**
- [ ] Product name and domain
- [ ] 3–5 pilot companies before week 6
- [ ] Register the business (CAC) for Paystack and USD payments
- [ ] Budget for Apple Developer and Windows code signing

**Risks:**

| Risk | Mitigation |
| --- | --- |
| Scope creep as a solo builder | Hold the MVP line |
| Agent reliability | Offline queue, heartbeats, idempotent sync, testing on weak networks |
| macOS permission friction | Guided onboarding |
| Worker backlash | Transparency rules; show output next to activity |
| Data and storage costs | Rollups, compression, retention limits |
| Mature competitors | Naira pricing, offline reliability, local support |
