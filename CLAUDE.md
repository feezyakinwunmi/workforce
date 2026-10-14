# CLAUDE.md — Workforce (remote team tracking SaaS)

Read this first. It holds the decisions made so far, the current state and the next steps.
Full product spec: `docs/SPEC.md`.

## What we are building

A multi-tenant SaaS that shows companies whether their remote workers are actually working:
clock in/out, active vs idle time, apps used, tasks done, and later chat, leave and payroll.
Built solo by Femi (full-stack JS/TS developer, Lagos). Explain changes in plain language and keep the MVP lean.

- Market: Nigeria / Africa first, then foreign companies. Nigerian companies often have staff abroad, so **time zones are per worker**.
- Billing: NGN (Paystack) for Nigeria-based companies, USD for everyone else. Billing not built yet (Phase 2).
- MVP = modules 1–4: core accounts, time tracking, activity monitoring, tasks. Screenshots, chat, billing, mobile, leave and payroll come later.
- Product name not decided: the UI name lives in `apps/web/src/lib/config.ts` (`APP_NAME`).

## Current status (14 Oct 2026)

- **Week 1 done and confirmed working by Femi:**
  - sign-up/login, forgot/reset/change password
  - create company, invites (with WhatsApp share), roles, teams, suspend/remove
  - company tracking settings, worker time zone
- **Weeks 2–6 core done:**
  - Electron desktop agent (`apps/agent`): login, consent, clock in/out, idle detection + prompt, app/window tracking, offline queue, heartbeat, tray
  - dashboard: live "who is working now" (Overview), per-person day view (`/dashboard/activity`), weekly timesheets + CSV
- **Migrations applied to Supabase:** 0001–0005, all live. 0004 schedules pg_cron jobs.
- **Not yet run on a real machine:** the desktop agent was built where Electron could not be installed. The tracking logic was tested with a simulated workday, and its upload format against the real `ingest_batch`. First job in a new session: `npm install`, `npm run agent`, then fix any startup or type errors.
- **Manual Supabase settings (not possible via MCP):**
  - Site URL `http://localhost:3000`, Redirect URL `http://localhost:3000/**`
  - "Confirm email" off during development
  - custom SMTP (Resend) needed before password-reset emails reach non-team addresses

## Repo layout

```
apps/agent/               Electron desktop app (TypeScript, no native modules)
  src/main.ts             window, tray, timers, IPC, login/logout, sync + heartbeat loops
  src/tracker.ts          ALL tracking logic (pure, testable): ticks, 10-min blocks, idle periods, payloads, pruning
  src/activeWindow.ts     front app + window title (Windows: long-running hidden PowerShell; macOS: osascript)
  src/api.ts              supabase-js client + register_device / heartbeat / ingest_batch wrappers
  src/storage.ts          login session encrypted with Electron safeStorage
  src/config.ts           Supabase URL/anon key, dashboard URL, timings
  renderer/               plain HTML/JS/CSS window (login, consent, main screen, idle prompt)
apps/web/                 Next.js 16 (App Router) dashboard
  src/proxy.ts            Next 16 proxy (formerly middleware): refreshes the Supabase session, guards /dashboard and /onboarding
  src/lib/supabase/       server.ts (server client), proxy.ts (session refresh)
  src/lib/session.ts      getSession / requireMember / requireAdmin (cached per request)
  src/lib/types.ts        hand-written DB types + FormState
  src/app/(auth)          login, signup (server actions + useActionState)
  src/app/onboarding      create company / accept pending invites
  src/app/invite/[token]  invite landing page
  src/app/dashboard       overview (live), activity (day view), timesheets (+ /export CSV), team, settings (admin), profile
  src/lib/tracking.ts     visibility rule (mirrors DB), live status, day stats loaders
  src/lib/time.ts         time-zone helpers (zonedMidnight, localDateIn, mondayOf)
supabase/migrations/      SQL migrations, in order (applied: 0001–0005)
docs/SPEC.md              product spec and roadmap
```

Commands (repo root): `npm install`, `npm run dev` (dashboard), `npm run agent` (desktop app), `npm run build`, `npm run typecheck --workspace web`, `npm run typecheck --workspace agent`.

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
- Sensitive operations go through `SECURITY DEFINER` functions with `set search_path = ''` and their own `auth.uid()` checks: `create_organization`, `accept_invitation`, `get_invitation` (anon, token-gated), `my_pending_invitations`, `update_my_timezone`.
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
- Live status: an open session with a heartbeat under 3 min old = working/idle; older = "App not reporting". The pg_cron job closes sessions after 30 min without a heartbeat (`agent_lost`); `ingest_batch` reopens them if data arrives.

## Next steps

1. Run the agent on Windows and fix anything that breaks: tray icon, PowerShell window reader, notifications.
2. Week 7: projects + tasks (assign, status, due date, comments), the worker picks the current task in the agent (add `task_id` to blocks or a `time_entries` table), and a daily work report at clock-out.
3. Week 8: package installers with electron-builder (Windows NSIS first), auto-update (electron-updater + GitHub Releases), set the dashboard URL for production, a "Download the app" page, and open the app at login (already wired when packaged).
4. Deploy the dashboard (Vercel) and update the Supabase Site URL + redirect URLs + agent `DASHBOARD_URL`.
5. Admin UI to set a team's manager (`teams.manager_id`) and a member's expected hours.

## Known gaps / backlog

- Ownership transfer; admin editing of a member's time zone or expected hours; team manager picker.
- App seconds are not reduced when idle time is discarded (top-apps can slightly exceed worked time).
- macOS agent gets the app name only (window titles need Accessibility permission work).
- Supabase "leaked password protection" is off (a paid-plan setting).
- Custom SMTP (e.g. Resend) before real users; turn "Confirm email" back on.
- Before launch: privacy policy, terms of service, DPA, a "what we track" notice; a Windows code-signing certificate; an Apple Developer account.
