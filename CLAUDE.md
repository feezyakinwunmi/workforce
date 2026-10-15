# CLAUDE.md — Phantomire Workbase (remote team tracking SaaS)

Read this first. It holds the decisions made so far, the current state and the next steps.
Full product spec: `docs/SPEC.md`.

## What we are building

A multi-tenant SaaS that shows companies whether their remote workers are actually working:
clock in/out, active vs idle time, apps used, tasks done, and later chat, leave and payroll.
Built solo by Femi (full-stack JS/TS developer, Lagos). Explain changes in plain language and keep the MVP lean.

- Market: Nigeria / Africa first, then foreign companies. Nigerian companies often have staff abroad, so **time zones are per worker**.
- Billing: prepaid per-person plans paid in NGN through Paystack (foreign cards pay the naira price). USD checkout later.
- MVP = modules 1–4: core accounts, time tracking, activity monitoring, tasks. Screenshots, chat, billing, mobile, leave and payroll come later.
- Product name: **Phantomire Workbase** (decided 14 Oct 2026), operator Phantomire. Shown via `APP_NAME` in `apps/web/src/lib/config.ts` and `apps/agent/src/config.ts`. The repo, Vercel project and releases repo keep the old "workforce" names.
- The desktop installer's identity deliberately stays "Workforce" (`productName`, `shortcutName`, `Workforce-Setup-x.exe`, appId `com.workforce.agent`): changing `productName` moves Electron's userData folder, which would log everyone out and drop unsent time. Rename it only together with a userData migration (e.g. at code-signing time).

## Current status (15 Oct 2026: HR suite on top of tracking)

- **Week 1 done and confirmed working by Femi:**
  - sign-up/login, forgot/reset/change password
  - create company, invites (with WhatsApp share), roles, teams, suspend/remove
  - company tracking settings, worker time zone
- **Weeks 2–6 core done:**
  - Electron desktop agent (`apps/agent`): login, consent, clock in/out, idle detection + prompt, app/window tracking, offline queue, heartbeat, tray
  - dashboard: live "who is working now" (Overview), per-person day view (`/dashboard/activity`), weekly timesheets + CSV
- **Distribution is live:** Windows installer published per tag `agent-v<version>` → GitHub release in public `feezyakinwunmi/workforce-releases` (v0.1.0 … v0.5.0 released; v0.6.0 = new name + notification app id fix and v0.7.0 = Pro screenshots, waiting for their tags), shown on https://phantomire-workforce.vercel.app/download. Installed apps auto-update from that repo (only while clocked out). Release = bump `apps/agent/package.json` version, commit, push tag `agent-v<version>`.
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
- **Week 10, chat and groups (agent v0.5.0):**
  - DB: migration 0009 `chat`: `channels` (kinds `public`, `private`, `direct`, `announcements`; every company gets `#general` + `Announcements` via trigger), `channel_members` (also holds `last_read_at`), `messages` (soft delete clears the text; edits marked). Helpers `private.my_channel_ids/can_read_channel/can_post_channel`. RPCs `create_channel` (managers/admins), `open_direct`, `add_channel_members`, `remove_channel_member`, `mark_channel_read` (also clears that chat's notifications), `my_channels` (sidebar + unread), `online_member_ids` (clocked in, heartbeat < 3 min). Notifications `chat_direct` (one per unread conversation) and `announcement`. `messages` is in the `supabase_realtime` publication.
  - privacy: admins/owner cannot read direct messages or private groups they are not in; only managers/admins post announcements; org admins may delete (not edit) messages in channels they can read.
  - dashboard: `/dashboard/chat` (sidebar with unread + green "working now" dots, live refresh), `/dashboard/chat/[id]` (Realtime room: send, edit, delete, load older, members/add/leave/archive), `/dashboard/chat/new` (message someone, new group). Browser Supabase client `lib/supabase/client.ts` (anon key; RLS applies). Chat unread badge in the nav.
  - agent: unread chat count on the main screen + tray "Open chat"; DM/announcement pop-ups come from notifications.
- **Leave and holidays:**
  - DB: migration 0010 `leave` (applied live): `leave_types` (defaults Annual 20 / Sick 10 / Unpaid per company via trigger; admins edit), `holidays` (admins add/remove), `leave_requests` (trigger `prepare_leave_request` sets user, company, status and `days` = weekdays minus holidays via `private.leave_days`; no overlaps). RPCs `decide_leave` (manager/admin who can see the person; never their own unless owner), `cancel_leave` (pending, or approved before it starts), `leave_balances(user, year)`. Notifications `leave_requested` (owner/admins + team manager) and `leave_decided`. 0011 `fk_indexes`.
  - dashboard: `/dashboard/leave` (balances, request form with live day count, my requests, approvals, who's off in 30 days, holidays), `/dashboard/leave/settings` (admins: leave types, holidays, Nigerian presets 2026/2027 in `lib/leave.ts` with Eid/Maulud marked estimated). Timesheets mark approved leave and holidays; CSV adds "Leave days"; Overview shows "On leave"; nav badge for pending approvals.
- **Payroll (Standard plan, owner/admin):** migration 0012 `payroll` (applied live): `member_pay` (one rate per person: hourly/monthly, NGN/USD, minor units; owner/admin read+write, each person reads own; changes audited by trigger). `lib/payroll.ts` `buildPayroll`: hourly = (hours + paid leave days × expected hours/day) × rate; monthly = salary − unpaid leave share of working days; "no time" days shown, never auto-deducted. `/dashboard/payroll` (+ `/export` CSV).
- Plans now: leave is in every plan; payroll is Standard; Pro = screenshots.
- **Chat files and @mentions:** migrations 0015 `chat_mention_kind` (enum `mention`), 0016 `chat_files_and_mentions`, 0017 `chat_file_removal` (all applied live). `messages.attachments` (jsonb array ≤ 5: path, name, size, type) and `messages.mentions` (uuid[] ≤ 20); text or a file required (`messages_content_check`). Private Storage bucket `chat-files` (10 MB, images/PDF/Office/text/CSV/zip, no SVG/HTML), path `<org>/<channel>/<uuid>/<name>`; `private.chat_file_channel(name)` parses it; storage policies reuse `can_read_channel` (download) / `can_post_channel` (upload); delete = uploader or org admin who can read the chat. `guard_message` only accepts files the author uploaded to that chat and takes size/type from Storage; keeps only mentions of active members who can read the chat; files and mentions are fixed after sending and cleared on delete. `after_message` sends `mention` notifications in public/private groups (not DMs or announcements). UI (`chat/[id]/room.tsx`): 📎 button, drag/drop and paste, image previews and file chips via 1-hour signed URLs, @ autocomplete (arrow keys, Enter/Tab), mentions highlighted (yours in amber); deleting a message also removes its files. Test: scratchpad test10 (23 checks).
- **Pro plan and screenshots (agent v0.7.0):** migrations 0018 `pro_plan` and 0019 `screenshots` (applied live; scratchpad test11, 28 checks).
  - Billing: `payments.plan` (`standard`/`pro`), kind `upgrade`; prices in `private.plan_price_kobo(plan)`: Standard ₦2,500, **Pro ₦4,000** per person per month. `org_billing` tier = `pro` while a successful Pro payment covers now; seats exclude `upgrade` rows. `start_payment(kind, seats, months, plan)` (the old 3-arg call = Standard); `upgrade` = Standard → Pro for the paid people and the days left (pays the difference); `add_seats` uses the current plan. `my_billing` adds `pro_price_kobo`. Dashboard billing: plan choice, "Upgrade to Pro now", Pro card; receipts show the plan.
  - Screenshots: off by default; `private.guard_screenshot_settings` (trigger on `organizations.settings`) refuses switching on without Pro, clamps the interval to 5/10/15/20/30/60 min, stamps `settings.screenshots_changed_at` (the version workers agree to), audits, and notifies every active member (`announcement`, link `/dashboard/screenshots`). Table `screenshots` (id from the agent; select = `visible_member_ids`), private bucket `screenshots` (JPEG ≤ 3 MB, path `<org>/<user>/<id>.jpg`, `private.screenshot_owner`): upload only own folder while `private.screenshots_on(org)`; RPCs `add_screenshot` (file must exist, time within 3 days) and `delete_my_screenshot` (workers delete their own; the row stays as "deleted"). Retention 90 days: Vercel cron `/api/cron/screenshot-cleanup` (02:15 UTC, `CRON_SECRET`, service role removes files and rows).
  - Dashboard: Company settings → Screenshots section (on/off, blur, interval; Pro badge), `/dashboard/screenshots` (person + day, grouped by hour, signed URLs, delete own), nav item when on Pro. Homepage, /what-we-track, /privacy and /download describe screenshots.
  - Agent: `src/screenshots.ts` (one per interval window at a random moment; the screen under the mouse via `desktopCapturer`, max 1600 px, JPEG; blur = shrink ×28 and scale back, on the computer; queue in `<userData>/screenshots`, ≤ 200 files / 3 days, uploads during sync). On only when `settings.screenshots_enabled` and `billing.tier === "pro"`; the consent screen asks again whenever `screenshots_changed_at` changes (time tracking keeps running meanwhile, but clock-in waits for consent); skipped while away (idle period open). Main screen shows "📷 Screenshots on" + "See yours".
- **Plan reminders and receipts:** migrations 0013 `billing_reminder_kind` (enum value `billing`, its own migration because a new enum value must be committed before use) and 0014 `billing_reminders` (applied live): `notifications.emailed_at`; unique index `notifications_billing_once`; `private.billing_reminders()` notifies owner/admins 7 days and 1 day before the paid plan or trial ends (pg_cron `billing-reminders`, 07:00 UTC); `claim_billing_emails()` (service_role only) returns unsent ones and marks them emailed. Vercel cron (`apps/web/vercel.json`, 07:30 UTC) → `/api/cron/billing-reminders` (needs env `CRON_SECRET`, checks `Authorization: Bearer`; doesn't claim when SMTP is unset) → `sendEmail` in `lib/email.ts`. Receipts: `/dashboard/billing/receipt/[id]` (admins, successful payments, print/PDF; "no VAT charged"). Dashboard sidebar and banners hide when printing.
- **Nigerian payroll (15 Oct 2026):** migrations 0020 `hr_notification_kinds` (payslip, expense_submitted, expense_decided, review) and 0021 `payroll_nigeria`: `payroll_settings` (per company: statutory on/off, pension 8%/10%, NHF on/off 2.5%, basic/housing/transport split 50/25/15), `member_pay` gains `statutory`, `annual_rent_minor`, `annual_reliefs_minor`; `payslips` (one per person per month, snapshot `data` jsonb, net = gross − deductions; admins issue/re-issue, the person reads own; trigger notifies + audits). Tax rules in `lib/payroll-tax.ts` (pure, tested): Nigeria Tax Act 2025 bands (0% first ₦800k, then 15/18/21/23/25%), no CRA, rent relief 20% max ₦500k, minimum wage ₦70k/month untaxed, monthly PAYE = annualised ÷ 12. `lib/pdf.ts` = dependency-free PDF writer (Helvetica, "NGN" not ₦); `lib/payslip-pdf.ts`. Pages: `/dashboard/payroll` (gross/deductions/net, PAYE and pension to remit, Issue payslips + email PDF), `/payroll/[userId]` (rate + tax details + live breakdown), `/payroll/settings`, `/dashboard/payslips` (+ `[id]`, `[id]/pdf`). CSV adds the breakdown.
- **Phone clock-in:** 0022 `phone_clock` + 0023 `phone_live_totals`: `work_sessions.source` ('desktop'|'phone'), `start_location`/`end_location` (only at clock-in/out), `activity_blocks.field_seconds` (phone time; written at clock-out by trigger), RPC `phone_clock(action, lat, lng, accuracy)`, 12-hour cap, a desktop clock-in ends an open phone session. **Use `member_day_totals`** (adds `phone_seconds`, counts running phone sessions live); `member_day_stats` is kept only for older code. Activity % = active ÷ (tracked − phone). Company settings `phone_clock` (default on), `phone_location` off/ask/required. `/dashboard/clock`, PWA manifest (`app/manifest.ts`, start_url `/dashboard/clock`, icons in `public/`, `app/apple-icon.png`). Status "On phone". Clocking out on the phone asks "What did you get done?" and offers the person's open tasks to mark done, like the desktop app: 0030 `phone_clock_out(summary, done_task_ids, lat, lng, accuracy)` writes the `daily_reports` row (day the session started, worker's time zone), marks own tasks done (guard_task applies), then clocks out.
- **Expense claims:** 0024 `expenses` (+0029 index): `expense_claims` (RLS: own + managers/admins who can see the person), private bucket `expense-receipts` (`<org>/<user>/<uuid>/<name>`), RPCs `decide_expense`, `cancel_expense`, `pay_expenses(payslip, ids)`. Approved claims (spent up to the month's end) are added to the payslip as untaxed "Expense refunds" and marked paid when payslips are issued. `/dashboard/expenses` (photo shrunk in the browser before upload).
- **Staff records:** 0025 (kind `staff_record`) + 0026 `staff_records`: `staff_profiles` (contact, DOB, start date/type = admin-only fields, bank, PFA/RSA PIN, TIN, emergency contact; only the person and owner/admins see it; owner/admins are notified when someone changes their own bank account), `staff_documents` + private bucket `staff-documents`, `onboarding_template` (7 defaults per company) and `onboarding_tasks` (seeded when someone joins; `start_onboarding(user)`). `/dashboard/records` (admin list, expiring IDs, template), `/dashboard/records/[id|me]`.
- **Goals and reviews:** 0027 `reviews`: `goals` (person + their managers), `reviews` (self_review → manager_review → shared → acknowledged; `stats` snapshot of hours/activity/tasks/leave/goals from `lib/reviews.ts periodStats`), `review_feedback` (hidden from the person until shared). RPCs `create_review`, `submit_self_review`, `save_review_feedback`, `acknowledge_review`. `/dashboard/reviews` (+ `new`, `[id]`).
- **Close company, email settings, chat search:** 0028: `close_company(name)` / `reopen_company()` (owner; clocking in stops at once; 14 days later the nightly cron `/api/cron/screenshot-cleanup` removes the files listed by `company_files(org)` (service role only) and deletes the organization, and everything cascades); `profiles.email_opt_out` (tasks, payslips, billing; respected by `emailMembers(..., kind)`, payslip emails and plan reminders); `messages.search` tsvector + `search_messages(q)` (RLS) and `/dashboard/chat/search`.
- **Clock reminders, push notifications, sticky notes (agent v0.8.0):** 0031 (kind `clock_reminder`) + 0032 `reminders_push_notes`.
  - Work hours: company `settings.work_start/work_end/work_days/clock_reminders` (Company settings → Work hours); each person `memberships.work_start/work_end/reminders` via `update_my_schedule` (Profile → Work hours and reminders). pg_cron `clock-reminders` (every 5 min) runs `private.clock_reminders()`: on working days (not holidays/leave), a `clock_reminder` notification at the start time if not clocked in today, and at the end time if still clocked in (once a day each; dedupe by `link`).
  - Desktop app 0.8.0: a `clock_reminder` pops up and stays (`timeoutType: never`), brings the window up, flashes it and rings (WebAudio tones in `renderer.js`, stops on click/key). Older apps show a normal pop-up.
  - Web Push (no library, `lib/webpush.ts`: RFC 8291 aes128gcm + VAPID ES256, round-trip tested): `push_subscriptions` (own devices), `push_config` (VAPID keys, created on first use, service role only), `notifications.pushed_at`, `claim_push_notifications()` (service role). pg_cron `push-dispatch` (every minute) → `private.request_push_dispatch()` → pg_net POST `https://phantomire-workforce.vercel.app/api/push/dispatch` only when something is waiting (no secret: it only sends what is due, each once). Service worker `public/sw.js` (reminders vibrate and stay until tapped; no page caching). `components/push-toggle.tsx` on Profile and the Clock page (`/api/push/key` gives the public key). iPhone needs the app added to the home screen first.
  - Notes: `notes` (private to the author, even from admins; colours yellow/pink/green/blue/purple/orange, pinned). `/dashboard/notes` = plain list; `/dashboard/notes/[id]` = the sticky note (pushpin, ruled paper, handwriting font stack, autosave).
- Plans: payroll/payslips = Standard; phone clock-in, expenses, staff records, goals/reviews are in every plan.
- **Speed and live updates (15 Oct 2026):** Vercel functions run in Dublin (`apps/web/vercel.json` `"regions": ["dub1"]`, next to Supabase eu-west-1; the default was Washington, so every query crossed the Atlantic). `getSession`/proxy use `auth.getClaims()` (local JWT check with signing keys, else same as getUser). Chat room (`chat/[id]/room.tsx`): Realtime is signed in first (`realtimeClient()` in `lib/supabase/client.ts`), plus an "anything new?" check (every 3 s while Realtime is down or has missed a message, else every 15 s, and on focus/online); sending shows the message at once (faded until saved) and text never waits for the previous message. Messages are bubbles (yours violet on the right, others grey on the left with avatar, names hidden in DMs; tap a bubble on a phone for Edit/Delete). On phones `ChatShell` (`chat/live.tsx`) shows one pane at a time: `/dashboard/chat` = the list (`OpenFirst` jumps to a conversation only on screens ≥ 768 px), a conversation fills the screen with a back arrow. `components/live-updates.tsx` in the dashboard layout refreshes badges/lists on any new message (Realtime) and when unread counts change (20 s check), and after returning to the tab.
- **Email codes instead of links (15 Oct 2026):** sign-up, password reset and "Email me a code instead" on the login page use a 6-digit code typed on the page (`app/(auth)/actions.ts`: `signup` → `verifyCode` (`verifyOtp` type email, then signup); `requestPasswordReset` → `resetWithCode` (checks the new password before using the code); `sendLoginCode` (`signInWithOtp`, `shouldCreateUser: false`); `resendCode`; a login with an unconfirmed email sends a new code and shows the code box). Supabase email templates must show `{{ .Token }}`: HTML in `docs/email-templates/` (pasted by Femi, DEPLOY.md §7 B2). `/auth/confirm` and `/reset-password` stay for old links.
- **Public homepage** (`app/page.tsx` + `app/_landing/timeline.tsx`): hero = the product's own day timeline for a team across time zones (one load animation, reduced-motion safe), set-up steps, features, privacy ("it never records"), naira pricing from `lib/billing.ts`, FAQ. Font: Bricolage Grotesque (next/font) on this page only. Logged-in visitors get "Open dashboard". Redesigned 14 Oct 2026 (hero = team timeline + desktop app card, facts strip, steps, features, privacy band, 3 plans, FAQ accordion).
- **Workbase Meet (built and pushed to main 15 Oct 2026; live once Femi finishes DEPLOY.md §10):** a separate meetings product under the Workbase brand, own address (`workbase-meet.vercel.app` or `meet.*`; `NEXT_PUBLIC_MEET_URL`), "just normal meetings" (not tied to work time). Team + outside guests (link + name, Supabase anonymous sign-in), instant + scheduled.
  - Plans: **Free** 60 min / 25 people; **Meet Pro** ₦1,000/host/month (24 h / 50 people; AI summaries "coming soon" = phase 2); **Meet Business** ₦10,000/company/month = Pro for 20 hosts (owner first). Workbase Standard/Pro companies get Meet Pro. Prices in `private.meet_price_kobo`, tier in `private.meet_tier(user)`; Paystack references `meet_…` → `meet_confirm_payment` (service role) via `recordSuccess`.
  - DB: migration 0033 `meet` (applied by Femi in the SQL Editor 15 Oct 2026: it has DELETE inside `meet_housekeeping`, which the MCP refuses). Tables `meet_rooms` (code `abc-defg-hij`), `meet_participants` (role host/cohost/member, status waiting/admitted/denied/removed/left, `sfu_session`, `tracks`, mic/cam/screen/hand), `meet_presence` (heartbeats kept out of Realtime), `meet_events` (chat, reactions, host commands), `meet_invites`, `meet_subscriptions`. Select-only RLS; every change through RPCs: `meet_create`, `meet_room_info` (anon too), `meet_join` (host's first join starts the clock; waiting room, lock, capacity, removed people blocked), `meet_ping` (8 s heartbeat + state), `meet_send`, `meet_moderate` (admit/deny/remove/mute/mute_all/stop_screen/lower_hand/co-host/lock/waiting room/end), `meet_leave`, `meet_media_check`, `meet_my_meetings`, `meet_my_plan`, `meet_start_payment`. pg_cron `meet-housekeeping` every 5 min (stale people left, rooms closed at the limit or 15 min empty, events 30 days, rooms 90 days). Test: scratchpad test20 (55 checks).
  - Guests: 0034 `meet_guests_stay_out` (Femi runs it in the SQL Editor): trigger `memberships_no_guests` refuses any membership for an anonymous user, so guests can't create or join a Workbase company (invitations already require a matching email). RLS gives them nothing else outside Meet.
  - Media: Cloudflare Realtime SFU (`lib/meet/cloudflare.ts`, server only; env `CF_REALTIME_APP_ID/APP_SECRET`, `CF_TURN_KEY_ID/API_TOKEN`). `/api/meet/[room]/media` checks `meet_media_check` with the user's JWT before every Cloudflare call; sessions are owned through an HMAC ticket; pulls only from sessions in the same room. Client `lib/meet/engine.ts`: one publish + one subscribe peer connection (Cloudflare rules, learned live 15 Oct 2026: a session whose connection isn't up within 30 s is dropped, so the subscribe session is created lazily on the first pull and rebuilt after 2 failed pulls; a track only becomes pullable once its publisher is connected, so the publisher waits for `connected` before announcing tracks and failed pulls retry every 2 s; a track without packets for 30 s is removed, so cameras off and stopped screen shares send a disabled black track); camera off = black track, mute = track disabled; screen share = 3rd transceiver. Track names get a number when published again (`camera.2`; `sourceOf()`); `Publisher.checkHealth()` every 10 s asks Cloudflare (`op: state` = GET session) and republishes a track missing twice; phones republish camera + mic after > 25 s in the background. Settings → "Connection details" shows sending/receiving per track (Cloudflare status, MB, frames, size, codec, why not received) with a Copy button; tiles say "Connecting video…" / "Video paused (data saver)". Backgrounds (`lib/meet/background.ts`): MediaPipe selfie segmenter from the jsdelivr CDN at runtime (blur light/strong, 4 images), falls back to the plain camera if it can't load. Data saver, MB meter, signal bars, device pickers, speaker output.
  - State: `lib/meet/use-room.ts` (Realtime on participants/rooms/events + polling 2 s/12 s fallback).
  - Pages: `app/meet/(site)` (home: signed out = hero, signed in = new/schedule/join + upcoming/recent; `schedule` emails an .ics invite with a 10-min alarm; `pricing`; `billing/callback`), `app/meet/[code]` (lobby → waiting → room → end screen; `meeting.tsx`, `room.tsx`: grid/speaker/screen layouts, chat, people panel with host controls, reactions, raise hand, 5-min warning on Free). Proxy rewrites the Meet host to `/meet/*` (except `MEET_PASSTHROUGH`: auth, api…); guests (anonymous) count as signed out for the dashboard. Chat: "Meet" button in a conversation header starts a meeting (no waiting room, no guests) and posts the link; links in chat messages are clickable.
  - Local test rig (scratchpad `mock/`): fake SFU in Chromium (`fakesfu.js`), meet RPCs on a real local Postgres (`meetpg.js`); `calltest.js` (3 people, video/audio, chat, reactions, hand, mute all, share, end) all pass. Not tested here: real Cloudflare, the MediaPipe CDN, Meet emails and payments.
- **Migrations applied to Supabase:** 0001–0032 (0020–0032 on 15 Oct 2026; 0032 also enables pg_net; the MCP cancels migrations containing DELETE statements or DROP FUNCTION, so add new functions instead of dropping). Earlier notes: 0001–0009, all live (0009 was applied live in parts named `chat_tables`, `chat_helpers`, `chat_message_rules`, `chat_rpcs`, `chat_policies`, `chat_default_channels`, `chat_notification_kinds`, `chat_realtime`: the Supabase MCP cancels any migration containing a DELETE statement in this setup, so `public.remove_channel_member` must be run by Femi in the SQL Editor; check with `select to_regprocedure('public.remove_channel_member(uuid,uuid)')`). 0010–0019 are live too. 0004, 0007, 0008 and 0014 schedule pg_cron jobs.
- **Manual Supabase/Vercel/Paystack settings (done by Femi, 15 Oct 2026):**
  - Site URL `https://phantomire-workforce.vercel.app`, Redirect URL `https://phantomire-workforce.vercel.app/**`
  - "Confirm email" on; custom SMTP (Gmail app password) in Supabase Auth and `SMTP_*`/`MAIL_FROM` on Vercel (docs/DEPLOY.md §7)
  - email templates with `{{ .Token }}` pasted (Confirm signup, Magic link, Reset password; docs/email-templates)
  - Paystack live: live secret key in Vercel `PAYSTACK_SECRET_KEY`, live callback `/dashboard/billing/callback` and webhook `/api/paystack/webhook`

## Design system (redesign, 14 Oct 2026)

- Logo: `components/logo.tsx` (`LogoMark`, `Logo` = mark + "Workbase"), from Femi's sketch: the curved "work" shape (violet) on a marigold base. Favicon `app/icon.svg`; desktop icons in `apps/agent/assets` + `build/icon.png`.
- Colours (`globals.css` @theme): ink `#15123a`, violet `brand-600 #6a4cf5`, marigold `#f2a93b`, canvas `#f7f6fb`. Charts: `chart-1` violet = active time, `chart-2 #cc7a12` = idle (validated colour-blind safe in both themes).
- Dark mode: `.dark` on `<html>` (inline script in `app/layout.tsx` applies the saved choice before paint; `components/theme-toggle.tsx` = light/dark/system in localStorage `theme`). The same Tailwind names (slate, brand, emerald, amber, red, sky, surface, raised) are remapped under `.dark`, so pages need almost no `dark:` classes. Use `bg-surface` (never `bg-white`) for panels.
- Fonts self-hosted with `next/font/local` (`app/fonts/inter.woff2`, `bricolage-grotesque.woff2`); `font-display` (Bricolage) for titles and big numbers.
- Building blocks: `components/icons.tsx` (hand-drawn SVG icon set, `<Icon name=…>`), `components/ui.tsx` (PageHeader, StatStrip, Panel, Avatar, Notice, EmptyState, InfoTip), `components/charts.tsx` (StackedColumns, Ring, BarList, Sparkline; HTML/SVG, hover tooltips, hidden data table), `components/day-nav.tsx` (person + day picker), `components/nav.tsx` (grouped sidebar + phone drawer), `components/auth-shell.tsx`, `components/site-chrome.tsx` (public header/footer).
- Walkthrough: `components/tour.tsx`; steps in `tourSteps()` in `app/dashboard/layout.tsx` (role-aware), anchored to `data-tour="…"` attributes; shown once per person per browser (`workbase-tour:<user id>`), restart from the ? button.
- Copy rule: no explanatory paragraphs under headings; put needed explanations in `InfoTip`.

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
  src/screenshots.ts      Pro screenshots: schedule, capture (+ blur), on-disk queue, upload
  renderer/               plain HTML/JS/CSS window (login, consent, main screen, idle prompt)
apps/web/                 Next.js 16 (App Router) dashboard
  src/proxy.ts            Next 16 proxy (formerly middleware): refreshes the Supabase session, guards /dashboard and /onboarding
  src/lib/supabase/       server.ts (server client), proxy.ts (session refresh)
  src/lib/session.ts      getSession / requireMember / requireAdmin (cached per request)
  src/lib/types.ts        hand-written DB types + FormState
  src/app/(auth)          login, signup (server actions + useActionState)
  src/app/onboarding      create company / accept pending invites
  src/app/invite/[token]  invite landing page
  src/app/dashboard       overview (live), chat (+ [id], new), screenshots, leave (+ settings), payroll (+ export), notifications, billing (+ callback, receipt/[id]), activity (day view), timesheets (+ /export CSV), tasks (+ [id]), projects, team, settings (admin), profile
  src/lib/tracking.ts     visibility rule (mirrors DB), live status, day stats loaders
  src/lib/time.ts         time-zone helpers (zonedMidnight, localDateIn, mondayOf)
  src/lib/tasks.ts        task/project types, labels, taskPermissions (mirrors guard_task), loadTaskTime
  src/lib/email.ts        optional SMTP email (sendEmail, emailMembers: tasks, comments, plan reminders); never throws
  src/lib/billing.ts      plan display constants and Free-plan helpers (safe for client components)
  src/lib/billing-server.ts  getBilling() (my_billing RPC, server only: never import it from a client component)
  src/lib/paystack.ts     Paystack initialize/verify/webhook signature, recordSuccess (service role)
  src/lib/supabase/admin.ts  service-role client (server only: payments, reminder emails, screenshot cleanup)
  src/lib/supabase/client.ts browser client (chat Realtime + sending messages; anon key)
  src/lib/chat.ts         chat types and helpers (attachments, file limits, storage names)
  src/lib/payroll.ts      monthly pay calculation (hours, leave, holidays, rates)
  src/lib/leave.ts        leave types/labels, countLeaveDays (mirrors private.leave_days), Nigerian holiday presets
  src/lib/payroll-tax.ts  Nigerian PAYE/pension/NHF (pure); lib/pdf.ts + lib/payslip-pdf.ts (payslip PDF)
  src/lib/expenses.ts, staff.ts, reviews.ts  types and labels for expenses, staff records, goals/reviews
  src/app/(legal)         public what-we-track, privacy, terms pages
  src/app/meet            Workbase Meet ((site) home/schedule/pricing, [code] lobby + room); src/lib/meet (engine, background, use-room, cloudflare, paths, server); src/app/api/meet/[room]/media
supabase/migrations/      SQL migrations, in order (applied: 0001–0033; 0034 waiting for Femi)
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
- Payments: prices live in the database (`private.seat_price_kobo()`); the browser never marks anything paid. Only the server, with the service-role key and after verifying with Paystack, calls `confirm_payment`. The service-role key is used only for: confirming payments, plan-reminder emails, and the nightly clean-up (old screenshots, closed companies).
- Chat: admins/owner never see direct messages or private groups they're not in (RLS via `private.can_read_channel`). Messages are posted through RLS (`private.can_post_channel`); author, company and timestamps are set by the `guard_message` trigger.
- Notifications are inserted only by SECURITY DEFINER triggers/jobs (`private.notify` skips the actor and non-active members); users may only `select` their own and `update (read_at)`.
- Membership rules are enforced by a trigger (`private.guard_membership_update`): nobody changes their own role or status; only the owner touches owner access; role, status and team changes are written to `audit_logs`.
- One active company per user in the MVP (`memberships_one_company_per_user` index).
- Store every timestamp in UTC. A "work day" is defined in the worker's own time zone.
- Privacy: track only while clocked in, never keystroke content, no webcam or microphone, workers can see their own data. Screenshots only on Pro, switched on by an admin, after each worker agrees to the current rules.

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

0. Femi: try the new modules end to end (issue a payslip, clock in from a phone, claim an expense, fill in a staff record, run a review). Have an accountant check the PAYE figures for a few real salaries before paying with them.
0b. Workbase Meet (pushed 15 Oct 2026): Femi does DEPLOY.md §10 (migration 0033 in the SQL Editor, anonymous sign-ins, Cloudflare keys, `workbase-meet` domain + `NEXT_PUBLIC_MEET_URL`) and test a real call on phone data.
1. Done 15 Oct 2026: agent v0.8.0 released, Paystack live, email + codes. Femi: check `CRON_SECRET` (§9) is set; launched publicly 15 Oct (posting daily); first real payment test (₦2,500, refund in Paystack).
2. Chat extras when pilots ask: message search, typing indicators, reactions/threads.
3. Mac build (Apple Developer account; macOS needs Screen Recording permission for screenshots); per-company screenshot retention; deduct time for deleted screenshots if customers ask.
4. Later (parked 15 Oct 2026, after pilots): "Workbase AI" on Pro, off until an admin switches it on. Order: Monday manager summary (hours, tasks, reports, leave; one call per company per week via the existing cron + email), receipt scanning for expenses, review first drafts, chat "catch me up", then "Ask Workbase" through RLS. Never productivity scores; never send screenshots or window titles to the AI provider; update /privacy (NDPA) first. Voice/video calls became Workbase Meet (above); Meet AI summaries come with Workbase AI.

## Known gaps / backlog

- Billing: no automatic renewals (prepaid only), no VAT invoices (receipts only), no USD checkout; seat limit is enforced by the desktop app (server still accepts uploads).
- Chat: no reactions, threads or search yet; files left behind by a failed removal stay in Storage (unreachable without the path); the desktop app shows unread counts and pop-ups but chatting happens in the dashboard.
- No task attachments or recurring tasks; no per-user email opt-out yet; due-tomorrow reminders are in-app/desktop only (no email).
- Agent pop-ups only appear while the desktop app is running and logged in.
- macOS agent gets the app name only (window titles need Accessibility permission work).
- Payroll: no year-to-date tax adjustment (each month is annualised on its own), no remittance files for PFAs or the state tax office (the CSV has the totals), payslips in NGN/USD only.
- Phone clock-in is a web page (PWA), not a store app; location only at clock-in/out, no geofence.
- Supabase "leaked password protection" is off (a paid-plan setting).
- Before launch: lawyer review of /privacy and /terms, a DPA for company customers; a Windows code-signing certificate; an Apple Developer account.
