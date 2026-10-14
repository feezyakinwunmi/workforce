# CLAUDE.md — Workforce (remote team tracking SaaS)

Read this first. It holds the decisions made so far, the current state and the next steps.
Full product spec: `docs/SPEC.md`.

## What we are building

A multi-tenant SaaS that shows companies whether their remote workers are actually working:
clock in/out, active vs idle time, apps used, tasks done, and later chat, leave and payroll.
Built solo by Femi (full-stack JS/TS developer, Lagos). Explain changes in plain language and keep the MVP lean.

- Market: Nigeria / Africa first, then foreign companies. Nigerian companies often have staff abroad, so **time zones are per worker**.
- Billing: prepaid per-person plans paid in NGN through Paystack (foreign cards pay the naira price). USD checkout later.
- MVP = modules 1–4: core accounts, time tracking, activity monitoring, tasks. Screenshots, chat, billing, mobile, leave and payroll come later.
- Product name not decided: the UI name lives in `apps/web/src/lib/config.ts` (`APP_NAME`).

## Current status (14 Oct 2026, Week 9: billing)

- **Week 1 done and confirmed working by Femi:**
  - sign-up/login, forgot/reset/change password
  - create company, invites (with WhatsApp share), roles, teams, suspend/remove
  - company tracking settings, worker time zone
- **Weeks 2–6 core done:**
  - Electron desktop agent (`apps/agent`): login, consent, clock in/out, idle detection + prompt, app/window tracking, offline queue, heartbeat, tray
  - dashboard: live "who is working now" (Overview), per-person day view (`/dashboard/activity`), weekly timesheets + CSV
- **Distribution is live:** Windows installer published per tag `agent-v<version>` → GitHub release in public `feezyakinwunmi/workforce-releases` (v0.1.0 … v0.4.0), shown on https://phantomire-workforce.vercel.app/download. Installed apps auto-update from that repo (only while clocked out). Release = bump `apps/agent/package.json` version, commit, push tag `agent-v<version>`.
- **Dashboard live on Vercel** (https://phantomire-workforce.vercel.app); the installed v0.1.0 app works end to end on Femi's PC.
- **Week 7, tasks & projects (released, agent v0.2.0):**
  - DB: migration 0006 `tasks` (applied live): `projects`, `tasks`, `task_comments`, `task_time`, `daily_reports`, trigger `private.guard_task`, RPCs `my_open_tasks`, `task_time_totals`; `ingest_batch` also takes `task_time` and `reports` (older agents still work)
  - agent: "Working on" task picker (picking a To-do task sets it In progress), time per task in each 10-min block, clock-out panel "What did you get done?" + "Mark task as done"; tray "Clock out…" opens that panel
  - dashboard: `/dashboard/tasks` (filters, create, inline status), `/dashboard/tasks/[id]` (edit, comments, time by person, delete), `/dashboard/projects` (managers/admins: create, edit, colour, archive), Activity shows tasks worked + the clock-out report, Overview shows tasks done today
- **Week 8, pilot-ready (agent v0.3.0):**
  - DB: migration 0007 `notifications_and_admin` (applied live): `notifications` (written only by triggers/jobs: task assigned, comment, task done; hourly pg_cron `task-due-reminders` from 08:00 worker-local), `transfer_ownership()` RPC, member audit now logs time zone / hours / job title
  - dashboard: Notifications page + unread badge in the nav; Team page: edit job title, expected hours and time zone per member, team manager picker, transfer ownership (owner only); optional task emails via SMTP (`lib/email.ts`, nodemailer; env `SMTP_HOST/PORT/USER/PASS`, `MAIL_FROM`; skipped if unset)
  - public pages (no login): `/what-we-track`, `/privacy`, `/terms` in `app/(legal)`; operator name, support email and "last updated" in `lib/config.ts`. Linked from sign-up, /download and the agent consent screen. **Drafts: have a lawyer review before paying customers.**
  - agent: new notifications shown as Windows pop-ups (checked after each heartbeat, `state.notifiedUntil`), click opens the dashboard; a new assignment refreshes the task list
- **Week 9, billing (agent v0.4.0):**
  - plans: **Free** (3 people, app names only, last 30 days, no CSV), **Standard** ₦2,500/person/month (unlimited people, window titles, day timeline, full history, CSV), **Pro** "coming soon"; new companies get a 14-day Standard trial (`organizations.trial_ends_at`), then fall back to Free (never locked out). `organizations.plan` is unused.
  - DB: migration 0008 `billing` (applied live): `payments` (prepaid periods; admins read), `private.org_billing()` derives tier/seat limit from successful payments covering now, `private.member_can_track()` (seats go owner first, then by join date), `my_billing()`, `start_payment(kind, seats, months)` (admin; the DB sets the price: 12 months = 10), `confirm_payment()` (service_role only). `register_device`/`heartbeat` now return `billing {tier, can_track, message}` and `settings.track_window_titles`.
  - dashboard: `/dashboard/billing` (plans, price calculator, Paystack redirect checkout, add people pro-rata, payment history), `/dashboard/billing/callback` (verifies with Paystack), `/api/paystack/webhook` (HMAC-SHA512), plan banner in the layout, Free gates (activity timeline + window titles hidden, history > 30 days and CSV blocked, "Not on plan" badge on Team). Server env: `PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Vercel only; see docs/DEPLOY.md §8).
  - agent: won't clock in when `can_track` is false (shows the reason), clocks out if the plan stops covering the person, sends no window titles on Free.
- **Migrations applied to Supabase:** 0001–0008, all live. 0004, 0007 and 0008 schedule pg_cron jobs.
- **Manual Supabase settings (not possible via MCP):**
  - Site URL `http://localhost:3000`, Redirect URL `http://localhost:3000/**`
  - "Confirm email" off during development
  - custom SMTP needed before password-reset emails reach non-team addresses: Gmail app password steps in docs/DEPLOY.md §7 (also set the same SMTP_* env vars on Vercel for task emails)

## Repo layout

```
apps/agent/               Electron desktop app (TypeScript, no native modules)
  src/main.ts             window, tray, timers, IPC, login/logout, sync + heartbeat loops
  src/tracker.ts          ALL tracking logic (pure, testable): ticks, 10-min blocks, idle periods, payloads, pruning
  src/activeWindow.ts     front app + window title (Windows: long-running hidden PowerShell; macOS: osascript)
  src/api.ts              supabase-js client + register_device / heartbeat / ingest_batch wrappers
  src/storage.ts          login session encrypted with Electron safeStorage
  src/config.ts           Supabase URL/anon key, dashboard URL, timings
  src/updater.ts          electron-updater (installs only while clocked out)
  renderer/               plain HTML/JS/CSS window (login, consent, main screen, idle prompt)
apps/web/                 Next.js 16 (App Router) dashboard
  src/proxy.ts            Next 16 proxy (formerly middleware): refreshes the Supabase session, guards /dashboard and /onboarding
  src/lib/supabase/       server.ts (server client), proxy.ts (session refresh)
  src/lib/session.ts      getSession / requireMember / requireAdmin (cached per request)
  src/lib/types.ts        hand-written DB types + FormState
  src/app/(auth)          login, signup (server actions + useActionState)
  src/app/onboarding      create company / accept pending invites
  src/app/invite/[token]  invite landing page
  src/app/dashboard       overview (live), notifications, billing (+ callback), activity (day view), timesheets (+ /export CSV), tasks (+ [id]), projects, team, settings (admin), profile
  src/lib/tracking.ts     visibility rule (mirrors DB), live status, day stats loaders
  src/lib/time.ts         time-zone helpers (zonedMidnight, localDateIn, mondayOf)
  src/lib/tasks.ts        task/project types, labels, taskPermissions (mirrors guard_task), loadTaskTime
  src/lib/email.ts        optional SMTP email (task assigned, comments); never throws
  src/lib/billing.ts      plan display constants, getBilling() (my_billing RPC), Free-plan gates
  src/lib/paystack.ts     Paystack initialize/verify/webhook signature, recordSuccess (service role)
  src/lib/supabase/admin.ts  service-role client (server only, payments confirmation only)
  src/app/(legal)         public what-we-track, privacy, terms pages
supabase/migrations/      SQL migrations, in order (applied: 0001–0008)
docs/SPEC.md              product spec and roadmap
```

Commands (repo root): `npm install`, `npm run dev` (dashboard), `npm run agent` (desktop app), `npm run fix:electron` (repair Electron on Windows), `npm run build`, `npm run typecheck`.
Release the desktop app: bump `apps/agent/package.json` version, commit, `git tag agent-v<version>`, push the tag (see docs/DEPLOY.md). Node 22/24 LTS recommended (`.nvmrc`).

## Supabase

- Project "Hr SAAS", ref `eacdtfbntkxrpfibblak`, region eu-west-1, Postgres 17.
- The Supabase MCP server is configured in `.mcp.json`, scoped to this project. Run `/mcp` once to sign in.
- Public URL and anon key are in `apps/web/.env.local`. **Never** put the service_role key in the agent, the browser or any `NEXT_PUBLIC_` variable.

### Migration workflow

1. Write a new file `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Never edit a migration that is already applied.
2. Apply it with the Supabase MCP `apply_migration` tool, using the same `<name>`.
3. Run `get_advisors` (security and performance) after every schema change and fix real findings.
4. Test RLS on the live DB with a `DO` block that inserts test users into `auth.users`, switches role with
   `execute 'set local role authenticated'` + `set_config('request.jwt.claims', '{"sub":"<uuid>"}', true)`,
   checks what each user can see, then ends with `raise exception` so everything rolls back.
5. Optionally regenerate types with `generate_typescript_types` (currently hand-written in `lib/types.ts`).

## Security conventions (do not break these)

- Every tenant table has `organization_id` and RLS enabled. Policies use `(select private.current_org_id())` and `(select private.is_org_admin())`. These are SECURITY DEFINER helpers in the `private` schema, which is not exposed to the API.
- Privileges: `revoke all ... from anon, authenticated`, then grant only the needed columns (column-level `update`/`insert`).
- Task rules are enforced by the trigger `private.guard_task`: managers/admins/owner change anything; a worker creates tasks only for themselves; the creator edits their task (may only assign themselves); the assignee may only change the status. `completed_at` is set by the trigger.
- Sensitive operations go through `SECURITY DEFINER` functions with `set search_path = ''` and their own `auth.uid()` checks: `create_organization`, `accept_invitation`, `get_invitation` (anon, token-gated), `my_pending_invitations`, `update_my_timezone`, `transfer_ownership` (sets `app.trusted_member_change` to pass the membership guard).
- Payments: prices live in the database (`private.seat_price_kobo()`); the browser never marks anything paid. Only the server, with the service-role key and after verifying with Paystack, calls `confirm_payment`. The service-role key is used for nothing else.
- Notifications are inserted only by SECURITY DEFINER triggers/jobs (`private.notify` skips the actor and non-active members); users may only `select` their own and `update (read_at)`.
- Membership rules are enforced by a trigger (`private.guard_membership_update`): nobody changes their own role or status; only the owner touches owner access; role, status and team changes are written to `audit_logs`.
- One active company per user in the MVP (`memberships_one_company_per_user` index).
- Store every timestamp in UTC. A "work day" is defined in the worker's own time zone.
- Privacy: track only while clocked in, never keystroke content, no webcam or microphone, workers can see their own data.

## Web app conventions

- Server Components fetch data with `createClient()` from `@/lib/supabase/server`. RLS does the filtering.
- Mutations are Server Actions in `actions.ts` next to the page. Forms use `useActionState` with `FormState` and the `SubmitButton`/`FormMessage` components in `components/form.tsx`.
- After an update through RLS, `.select("id")` and treat 0 rows as "no permission".
- Styling is Tailwind v4 with component classes in `globals.css` (`card`, `input`, `label`, `btn-primary`, `btn-secondary`, `btn-danger`, `btn-sm`, `badge`) and a violet `brand-*` palette.

## Tracking model (keep consistent)

- Agent samples every 10 s.
  - Input within 10 s → `active`.
  - No input → `idle` (still counted as worked) until `settings.idle_timeout_minutes`.
  - After that an `idle_periods` row starts. The worker keeps it (counted) or discards it (moved to `excluded_seconds`). Unanswered idle is discarded at clock-out. 60 min idle → auto clock-out at idle start.
- Worked time = `active_seconds + idle_seconds`. Activity % = active ÷ worked.
- Blocks are aligned to 10 minutes. The agent always sends running totals, so uploads are idempotent; `batch_id` dedupes exact repeats.
- The agent corrects its clock with `server_time` from every response. A sleep or freeze gap over 60 s is not tracked.
- Visibility: worker = self; manager = same team or teams they manage (`teams.manager_id`); owner/admin = all. DB: `private.visible_member_ids()`. UI mirror: `visibleMembers()` in `lib/tracking.ts`.
- Tasks: the worker picks a current task in the agent; every tracked second (active or idle) also goes to `blocks.tasks[taskId]`, uploaded as `task_time` (running totals per block, max 600 s). Discarding idle trims app and task seconds proportionally. The open-task list is cached on the computer (refresh on login, clock-in, window focus, every 5 min). The clock-out report is a `daily_reports` row (id from the agent, `work_date` = worker's local date).
- Live status: an open session with a heartbeat under 3 min old = working/idle; older = "App not reporting". The pg_cron job closes sessions after 30 min without a heartbeat (`agent_lost`); `ingest_batch` reopens them if data arrives.

## Next steps

1. Femi: Paystack test setup (docs/DEPLOY.md §8: two Vercel env vars + webhook URL), test-pay with the test card; email setup (§7); push tag `agent-v0.4.0`.
2. Pilot with one real company; register the business (CAC) so Paystack can go live.
3. Renewal reminder emails (7 and 1 days before `paid_until`), a printable receipt/invoice page with 7.5% VAT once registered.
4. Mac build (Apple Developer account), then chat and groups (Supabase Realtime), leave requests, Pro features (screenshots).

## Known gaps / backlog

- Billing: no automatic renewals (prepaid only), no renewal emails yet, no invoices/VAT, no USD checkout; seat limit is enforced by the desktop app (server still accepts uploads).
- No task attachments or recurring tasks; no per-user email opt-out yet; due-tomorrow reminders are in-app/desktop only (no email).
- Agent pop-ups only appear while the desktop app is running and logged in.
- macOS agent gets the app name only (window titles need Accessibility permission work).
- Supabase "leaked password protection" is off (a paid-plan setting).
- Custom SMTP before real users (docs/DEPLOY.md §7); turn "Confirm email" back on.
- Before launch: lawyer review of /privacy and /terms, a DPA for company customers; a Windows code-signing certificate; an Apple Developer account. No "delete my company" button yet (the privacy policy promises deletion within 90 days of closing: do it by hand for now).
