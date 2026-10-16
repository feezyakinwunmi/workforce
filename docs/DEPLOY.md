# Going live: dashboard on Vercel + desktop app installer

Do these once, in order. It takes about 30 minutes. After that, every update is one command.

## 1. Put the dashboard online (Vercel)

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New… → Project**.
2. **Import** `feezyakinwunmi/workforce`. If it's not listed, click *Adjust GitHub App Permissions* and allow this repo.
3. **Root Directory** → **Edit** → choose `apps/web`. The framework shows **Next.js** automatically.
4. **Environment Variables** (copy the values from `apps/web/.env.local`):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://eacdtfbntkxrpfibblak.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key from `.env.local` |
   | `ELECTRON_SKIP_BINARY_DOWNLOAD` | `1`, so Vercel doesn't download the desktop app's engine |

   Don't add `NEXT_PUBLIC_SITE_URL`. The app uses your Vercel address automatically. Add it later only if you connect your own domain.
5. Click **Deploy**. When it finishes you get an address like `https://workforce-abc.vercel.app`. That's **your dashboard address**.

From now on, every push to `main` redeploys automatically.

## 2. Tell Supabase about the new address

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: your dashboard address, e.g. `https://workforce-abc.vercel.app`
- **Redirect URLs**: add `https://workforce-abc.vercel.app/**`, and keep `http://localhost:3000/**` for local development

Without this, sign-up and password-reset emails point to the wrong place.

## 3. Create the public "releases" repo for installers

Your code repo stays **private**. Installers go in a separate **public** repo, so workers can download them and the app can update itself without any password.

1. [github.com/new](https://github.com/new) → name **`workforce-releases`** → **Public** → tick **Add a README file** → **Create repository**.

## 4. Give GitHub Actions permission to publish there

1. Create a token: [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new)
   - **Name**: `workforce release publisher`, **Expiration**: 1 year
   - **Repository access** → *Only select repositories* → `workforce-releases`
   - **Permissions → Repository permissions → Contents** → **Read and write**
   - **Generate token**, then copy it.
2. In the **workforce** repo: **Settings → Secrets and variables → Actions**
   - **Secrets** tab → **New repository secret** → Name `RELEASES_TOKEN`, value = the token
   - **Variables** tab → **New repository variable** → Name `DASHBOARD_URL`, value = your dashboard address from step 1

## 5. Publish the first installer

On your computer, in the project folder:

```powershell
npm install                      # updates package-lock.json with the installer tools
git add -A
git commit -m "Desktop installer, auto-update, download page, Vercel setup"
git push
git tag agent-v0.1.0
git push origin agent-v0.1.0
```

Open the **workforce** repo → **Actions** → *Release desktop app*. After about 5–10 minutes it's green, and `workforce-releases` has a release with `Workforce-Setup-0.1.0.exe`.

Visit `https://<your dashboard>/download`. The **Download for Windows** button is live. Send workers that link, or they find it in the dashboard menu under **Download desktop app**.

## 6. Releasing an update later

1. Change the code, and bump `"version"` in `apps/agent/package.json` (e.g. `0.1.0` → `0.1.1`).
2. Commit and push, then `git tag agent-v0.1.1` and `git push origin agent-v0.1.1`.

Installed apps download the update in the background and install it the next time the worker is clocked out. The tag must match the version, or the build stops with a clear message.

## 7. Turn on email (password resets, sign-up confirmations, task emails)

Supabase's built-in sender only reaches your own Supabase team's addresses. Before real users, give it (and the dashboard) a real mailbox. Without a domain, a Gmail address works well for a pilot (up to about 500 emails a day).

**A. Create a Gmail app password**
1. Use a Gmail account for the product (e.g. `info.phantomire@gmail.com`). Turn on **2-Step Verification**: [myaccount.google.com/security](https://myaccount.google.com/security).
2. Open [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create one named `Workbase`, copy the 16-letter password.

**B. Supabase (password resets and sign-up emails)**
Supabase dashboard → **Authentication → Emails → SMTP Settings** → enable custom SMTP:

| Field | Value |
| --- | --- |
| Sender email | your Gmail address |
| Sender name | `Phantomire Workbase` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | your Gmail address |
| Password | the app password |

Then **Authentication → Sign In / Providers → Email** → turn **Confirm email** back on, and in **Authentication → Rate Limits** raise "emails per hour" (e.g. 100).

**B2. Codes instead of links (sign-up, password reset, "email me a code")**
The app asks for a code typed on the page, so every email must show `{{ .Token }}`. Supabase dashboard → **Authentication → Emails → Templates**, paste the HTML from `docs/email-templates/` (Subject in brackets):

| Template | File | Subject |
| --- | --- | --- |
| Confirm signup | `confirm-signup.html` | Your Workbase sign-up code |
| Magic link | `magic-link.html` | Your Workbase sign-in code |
| Reset password | `reset-password.html` | Your Workbase password reset code |

Codes last 1 hour (Authentication → Sign In / Providers → Email → "Email OTP Expiration"). Also set **Authentication → URL Configuration → Site URL** to `https://phantomire-workforce.vercel.app` and add `https://phantomire-workforce.vercel.app/**` to Redirect URLs (old links in already-sent emails still land on `/auth/confirm`).

**C. Vercel (task emails: "assigned to you", new comments)**
Vercel → your project → **Settings → Environment Variables**, add for Production:

| Name | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | your Gmail address |
| `SMTP_PASS` | the app password |
| `MAIL_FROM` | `Phantomire Workbase <your Gmail address>` |

Then **Deployments → ⋯ → Redeploy**. Without these variables, task emails are simply skipped; in-app and desktop notifications still work.

**Later, with your own domain:** use [Resend](https://resend.com) (verify the domain, then host `smtp.resend.com`, port `465`, user `resend`, password = API key) in both places, so emails come from `hello@yourdomain.com`.

## 8. Turn on payments (Paystack)

The Plan and billing page (owners and admins) takes payments through Paystack: card, bank transfer and USSD.

1. Paystack dashboard → **Settings → API Keys & Webhooks**. Copy the **Secret Key** (`sk_test_...` while testing).
2. Supabase dashboard → **Project Settings → API Keys** → copy the **service_role** key (secret; the dashboard server uses it only to record confirmed payments).
3. Vercel → project → **Settings → Environment Variables** (Production), add:

   | Name | Value |
   | --- | --- |
   | `PAYSTACK_SECRET_KEY` | the Paystack secret key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the Supabase service_role key |

   Never put either in a `NEXT_PUBLIC_` variable, the desktop app or GitHub.
4. Back in Paystack, same page: **Test Webhook URL** = `https://<your dashboard>/api/paystack/webhook`, **Test Callback URL** = `https://<your dashboard>/dashboard/billing/callback`. Save.
5. Vercel → **Deployments → ⋯ → Redeploy**.
6. Test: dashboard → **Plan and billing** → pay with Paystack's test card `4084 0840 8408 4081`, any future expiry, CVV `408`, PIN `0000`, OTP `123456`.

**Going live:** when Paystack approves your business (CAC documents), swap in the **live** secret key and set the **Live** webhook and callback URLs to the same addresses.

**Giving a pilot company Standard for free:** Supabase → SQL Editor:
```sql
insert into public.payments (organization_id, reference, kind, seats, months, amount_kobo, status, period_start, period_end)
select id, 'manual-' || slug || '-' || to_char(now(), 'YYYYMMDD'), 'manual', 20, 1, 0, 'success', now(), now() + interval '1 month'
from public.organizations where slug = 'their-company-slug';
```

## 9. Daily jobs: plan reminder emails and screenshot cleanup

Every morning the database writes "your plan / free trial ends in 7 days" and "…tomorrow" reminders for owners and admins (dashboard + desktop pop-up). A daily Vercel job then emails them, once each.

1. Make a random secret: any long password, e.g. from a password generator (30+ letters and digits).
2. Vercel → project → **Settings → Environment Variables** (Production), add `CRON_SECRET` = that secret. Vercel sends it to the job automatically; without it the job refuses to run.
3. The job needs `SUPABASE_SERVICE_ROLE_KEY` (§8) and the SMTP variables (§7). Without SMTP the reminders still appear in the dashboard and desktop app; they just aren't emailed.
4. Redeploy. Check it under Vercel → project → **Settings → Cron Jobs** (`/api/cron/billing-reminders`, daily 07:30 UTC = 08:30 Lagos). **Run** there to test it.

The same secret protects the second daily job, `/api/cron/screenshot-cleanup` (02:15 UTC), which deletes Pro screenshots older than 90 days.

Receipts: Plan and billing → Payments → **Receipt** on any successful payment (print or save as PDF).

## 10. Workbase Meet (video meetings)

Meet is part of the same Vercel project but has its own address. Video and sound travel through Cloudflare Realtime (free for the first 1,000 GB a month, then $0.05 per GB).

**A. Database (once).** Supabase → **SQL Editor** → paste all of `supabase/migrations/20261015000033_meet.sql` → **Run**. (Run it here, not through Claude: it contains a clean-up step that the Supabase connector refuses to apply.) Check: `select to_regprocedure('public.meet_join(text,text)');` returns a name, not empty.

**A2. Short memory (once).** Also run `supabase/migrations/20261015000035_meet_short_memory.sql` in the SQL Editor: meeting chat is deleted when a meeting ends, meetings and guest logins 7 days later.

**B. Guests without an account.** First run `supabase/migrations/20261015000034_meet_guests_stay_out.sql` in the SQL Editor (it stops guest logins from ever creating or joining a Workbase company). Then Supabase → **Authentication → Sign In / Providers** → turn on **Allow anonymous sign-ins** → Save. Guests then join with just a name; they can't open the dashboard.

**C. Cloudflare keys.**
1. Cloudflare dashboard (a free account is enough) → **Realtime** → **SFU** → **Create application**. Copy the **App ID** and the **App secret**.
2. Realtime → **TURN** → **Create TURN key**. Copy the **Key ID** and the **API token**. (TURN lets calls work behind strict office or mobile networks.)
3. Vercel → project → **Settings → Environment Variables** (Production and Preview), add:
   - `CF_REALTIME_APP_ID`, `CF_REALTIME_APP_SECRET`
   - `CF_TURN_KEY_ID`, `CF_TURN_KEY_API_TOKEN`

   These are secrets: never add them with a `NEXT_PUBLIC_` name and never paste them in a chat.

**D. Its own address.**
1. Vercel → project → **Settings → Domains** → **Add** `workbase-meet.vercel.app` (or later `meet.yourdomain.com`). Any address starting with `workbase-meet` or `meet.` opens Meet at its root.
2. Environment Variables: `NEXT_PUBLIC_MEET_URL` = `https://workbase-meet.vercel.app` (no slash at the end). Meeting links in emails and chat then use this address.
3. Supabase → **Authentication → URL Configuration** → Redirect URLs: add `https://workbase-meet.vercel.app/**`.
4. Redeploy.

**E. Test.** Open the Meet address, sign in, **New meeting**, then open the link on your phone (mobile data, not Wi-Fi) as a guest. You should see and hear each other. Try screen sharing, a reaction and **End for everyone**.

**Plans.** Free: meetings up to 60 minutes and 25 people. Meet Pro ₦1,000 per host a month: up to 24 hours and 50 people. Meet Business ₦10,000 a month: Pro for 20 hosts in one company (owner first). A company on Workbase Standard or Pro gets Meet Pro for everyone. Meet payments use the same Paystack keys and webhook as §8 (references start with `meet_`).

## 11. Workbase Book (booking pages)

Book is part of the same Vercel project with its own address, like Meet. Customers book without an account; payments go straight to each host's bank account through Paystack split payments (subaccounts), with Workbase's 3% fee on the Free plan.

**A. Database (once).** Supabase → **SQL Editor** → paste all of `supabase/migrations/20261016000036_book.sql` → **Run** (confirm the warning). Check: `select to_regprocedure('public.book_create(text,uuid,timestamptz,text,text,text,text)');` returns a name.

**B. Its own address.**
1. Vercel → **Settings → Domains** → **Add** `workbase-book.vercel.app` (or later `book.yourdomain.com`). Any address starting with `workbase-book` or `book.` opens Book at its root.
2. Environment Variables: `NEXT_PUBLIC_BOOK_URL` = `https://workbase-book.vercel.app` (no slash at the end).
3. Supabase → **Authentication → URL Configuration** → Redirect URLs: add `https://workbase-book.vercel.app/**`.
4. Redeploy.

**C. Payments.** Nothing new to add: Book uses the same `PAYSTACK_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and webhook as §8 (references start with `book_` for bookings and `bookpro_` for Book Pro). Paystack must allow subaccounts (split payments) on your live business; if a host's bank account is refused, check that in the Paystack dashboard.

**D. Emails.** Confirmation, cancellation and reminder emails (a day and an hour before) use the SMTP settings from §7. The database asks the website to send them every 5 minutes (`/api/book/mail`).

**E. Test.** Open the Book address, sign in, create your page, add your bank account (Settings → Payouts), then book a free call and a paid one from your phone. Refunds: the host refunds the customer directly (for example by bank transfer).

## 12. Owner console (growth, money, support)

A private console for the people who run Workbase: sign-ups, companies using it, money in by product, where people drop off, trials ending, app versions, and a support page for each company. It has its own address and only opens for the emails you list.

**A. Database (once).** Supabase → **SQL Editor** → paste all of `supabase/migrations/20261016000038_owner_console.sql` → **Run**. Check: `select to_regprocedure('public.admin_overview(integer)');` returns a name. If `20261015000035_meet_short_memory.sql` (§10 A2) hasn't been run yet, run that first.

**B. Who can open it.** Vercel → **Settings → Environment Variables** (Production): `ADMIN_EMAILS` = your sign-in email (several: separate with commas). Server only: never `NEXT_PUBLIC_`. Anyone else who opens the address gets "page not found".

**C. Its own address.**
1. Vercel → **Settings → Domains** → **Add** `workbase-admin.vercel.app` (pick any free name starting with `workbase-admin`, or later `admin.yourdomain.com`).
2. Environment Variables: `ADMIN_URL` = `https://workbase-admin.vercel.app` (no slash at the end).
3. Supabase → **Authentication → URL Configuration** → Redirect URLs: add `https://workbase-admin.vercel.app/**`.
4. Redeploy, open the address and sign in with that email.

**D. Tabs (migration 0039).** Supabase → **SQL Editor** → paste all of `supabase/migrations/20261016000039_console_tabs.sql` → **Run**. It adds the Workbase, Meet, Book, Money and Accounts tabs. Check: `select to_regprocedure('public.admin_workbase(integer)');` returns a name.

**E. Your authenticator (second step).** The console asks for a 6-digit code from an authenticator app on your phone, as well as your password, and asks again every 12 hours.
1. Supabase → **Authentication → Sign In / Providers → Multi-Factor Authentication** (or **Authentication → MFA**): make sure **TOTP (App Authenticator)** is enabled. It is on by default.
2. Open the console address and sign in. The first time, it shows a QR code: scan it with Google Authenticator or Microsoft Authenticator and type the code. After that it only asks for the code.
3. Lost your phone? Supabase → **Authentication → Users** → your account → delete its MFA factor (or ask Claude to do it), then sign in to the console again to set up a new phone. Your normal Workbase login keeps working without the code.

**Support access.** You always see a company's plan, payments, people, last clock-ins, app versions and warnings. For a closer look (hours, clock-ins, task counts, leave, recent changes) the company's owner or an admin clicks **Allow support access** in Company settings (1, 3 or 7 days). Each closer look is listed for them there. Chats, notes, screenshots, pay and staff records are never shown in the console. Support notes you add are seen only in the console.

## 13. "Continue with Google" (login and sign-up)

The button appears on the login and sign-up pages by itself once Google is switched on in Supabase (the site checks every 5 minutes). Same email = same account, so existing users can use it too.

1. Google Cloud Console (console.cloud.google.com, no card needed: skip any free-trial offer): new project "Workbase" → **Google Auth Platform → Get started** (app name Workbase, External) → **Branding** (home page, /privacy, /terms) → **Audience → Publish app**.
2. **Clients → Create client → Web application**. Authorized redirect URI: `https://eacdtfbntkxrpfibblak.supabase.co/auth/v1/callback`. Copy the Client ID and secret (keep the secret private).
3. Supabase → **Authentication → Sign In / Providers → Google**: switch on, paste both, Save.
4. Supabase → **Authentication → URL Configuration → Redirect URLs**: the site's own addresses must be there (`https://phantomire-workforce.vercel.app/**`, and the Meet, Book and console addresses). After Google, people come back to `/auth/callback` on the same address.

The desktop app still signs in with email and password: people who signed up with Google set a password once in Profile → Password.

## Good to know

- **"Windows protected your PC"**: shown for unsigned apps. Workers click *More info → Run anyway*. Before paying customers, sign the app with a certificate (Azure Trusted Signing is the cheapest). electron-builder signs automatically once it's configured.
- **The installer** installs per user (no admin rights), adds desktop and Start-menu shortcuts, starts the app after installing, and sets it to start with Windows.
- **Mac**: needs an Apple Developer account ($99/year) and a Mac or a macOS GitHub runner for signing. Planned for later.
- **Building an installer locally** (optional): `cd apps/agent && npm run dist` → `apps/agent/release/`. On Node 26 Electron may install badly; `npm run fix:electron` repairs it, but CI uses Node 22, which avoids the problem.
