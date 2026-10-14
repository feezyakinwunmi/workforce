# Workforce — remote team tracking SaaS

Companies see whether their remote workers are working: clock in/out, active vs idle time, apps used, timesheets. Every company's data is kept separate by Supabase row-level security.

```
workforce/
├─ apps/web/                  Next.js dashboard (owners, admins, managers, workers)
├─ apps/agent/                Electron desktop app workers install (clock in/out + tracking)
├─ supabase/migrations/       Database schema, security rules and functions
├─ docs/SPEC.md               Product spec and roadmap
├─ docs/DEPLOY.md             Going live: Vercel, Supabase URLs, publishing the Windows installer
├─ .github/workflows/         CI checks on every push; desktop installer release on tag agent-v*
└─ CLAUDE.md                  Decisions, conventions and next steps (for Claude Code)
```

**Done so far**
- Accounts: sign up, log in, forgot/reset password, change password
- Companies: invites by link, roles, teams, suspend or remove, tracking settings
- Desktop app: clock in/out, idle detection with "were you working?", app tracking, offline queue
- Dashboard: who is working now, per-person activity day view, weekly timesheets with CSV export
- Distribution: one-click Windows installer, auto-update, public /download page
- Tasks: projects, tasks with assignee, priority, due date and comments; the worker picks the current task in the desktop app so time is logged per task; a "what I got done" report at clock-out
- Notifications: task assigned, new comment, task done, due tomorrow, in the dashboard and as desktop pop-ups (plus email once SMTP is set up)
- Admin tools: team managers, expected hours and time zone per member, ownership transfer
- Public pages: what we track, privacy policy, terms of service
- Billing: Free (3 people), 14-day Standard trial, Standard ₦2,500 per person per month prepaid through Paystack

## 1. Database

All migrations in `supabase/migrations/` are already applied to the Supabase project "Hr SAAS" and checked on the live database.
For a fresh project, run them in order in **SQL Editor** (`…004_scheduled_jobs.sql` needs the `pg_cron` extension, which Supabase has).

## 2. Supabase dashboard settings (manual, once)

**Authentication → URL Configuration**
- Site URL: `http://localhost:3000`
- Redirect URLs: add `http://localhost:3000/**`

**Email**
Supabase's built-in email sender only delivers to your own Supabase team members' addresses, and only a few emails per hour. Sign-up confirmations and **password-reset emails** to other people need your own SMTP:

1. Create a free [Resend](https://resend.com) account, verify your domain (or use their test sender for yourself), create an API key.
2. In Supabase: **Authentication → Emails → SMTP Settings**: enable custom SMTP. Host `smtp.resend.com`, port `465`, user `resend`, password = the API key, sender = an address on your verified domain.

Until then, keep **Confirm email** off (**Authentication → Sign In / Providers → Email**) so test sign-ups work.

**Optional: email links that work on any device.** In **Authentication → Emails**, change the links to:
- Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`
- Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

## 3. Run it (Node.js 20+)

```bash
npm install          # installs the dashboard and the desktop app (downloads Electron the first time)
npm run dev          # dashboard → http://localhost:3000
npm run agent        # desktop app, in a second terminal
```

If `npm run agent` says "Electron failed to install correctly" (happens on Node 26), run `npm run fix:electron`. Node 22 or 24 LTS avoids it.

`apps/web/.env.local` and `apps/agent/src/config.ts` already point at your Supabase project. They hold only the public anon key. Never put the `service_role` key in either app.

## 4. Try the tracking flow

1. In the dashboard, as owner: **Company settings** → set "Mark as idle after" to **1** minute (so you can see the idle prompt quickly).
2. Run `npm run agent`, log in as a worker (or yourself), read the consent screen, click **Clock in**.
3. Use your computer for a few minutes, then leave the mouse and keyboard alone for 2 minutes and come back: the app asks whether that time was work.
4. In the dashboard: **Overview** shows you as *Working*. **Activity** shows the 10-minute bars, apps and windows. **Timesheets** shows the week, with **Download CSV**.
5. Turn off Wi-Fi for a few minutes while clocked in: the app says *Offline* and uploads everything when you reconnect.
6. As owner: **Activity → Computers → Disconnect** stops that computer's app.

**Tasks**
1. As owner or manager: **Projects** → create a project. **Tasks → + New task** → assign it to a worker.
2. In the desktop app (as that worker): **Working on** → pick the task. It moves to *In progress*.
3. Work a few minutes, then **Clock out**: write what you got done, tick *Mark as done* if it's finished.
4. In the dashboard: the task shows the time logged, **Activity** shows the tasks worked and the report, **Overview** counts tasks done today.

The window closes to the system tray. **Quit** from the tray menu clocks you out.

## How tracking works

- Every 10 s the app samples system idle time. Input in the last 10 s counts as **active**. No input counts as **idle but still working** until the company's idle timeout.
- Past the timeout, an **idle period** starts. When the worker returns they choose *Yes, count it* (with a reason) or *No, remove it*. Unanswered idle time is removed at clock-out. After 60 minutes of idle the app clocks out automatically.
- Time is stored in 10-minute blocks (`activity_blocks`) with active / idle / removed seconds, plus seconds per app and window title.
- Everything is saved on the computer first and uploaded every 2 minutes through `ingest_batch()`. Uploads are safe to repeat, so a flaky connection never double-counts.
- A heartbeat every minute powers "who is working now" and picks up settings changes. If the app stops reporting for 30 minutes, a scheduled job closes the session. It reopens automatically if the app was only offline.
- The app never records keystrokes, screenshots, the webcam or the microphone, and nothing at all while clocked out.

## Security

- Every table carries `organization_id`. RLS only returns rows of the company the user is an **active** member of.
- Tracking data visibility:
  - workers see their own
  - managers see their team's (same team, or teams they manage)
  - owners and admins see everyone in the company
- The desktop app can only write through `register_device`, `heartbeat` and `ingest_batch`. These check the signed-in user, the computer (admins can disconnect it) and session ownership.
- Nobody can change their own role, and only the owner can touch owner access. Changes are written to `audit_logs`.

Tested on a local Postgres simulating Supabase (over 120 checks), with a simulated workday through the agent's tracking logic, and with spot checks on the live database.

## Going live

See **docs/DEPLOY.md**: deploy the dashboard to Vercel, update the Supabase URLs, then publish the installer by pushing a tag (`agent-v0.1.0`). Workers download it from `/download`.

## Next

Renewal reminders and invoices, Mac build, then chat and leave requests. Code signing for the installer and the Mac version before paying customers. See `CLAUDE.md`.
