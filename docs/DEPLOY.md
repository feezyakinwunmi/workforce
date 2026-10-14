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
2. Open [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), create one named `Workforce`, copy the 16-letter password.

**B. Supabase (password resets and sign-up emails)**
Supabase dashboard → **Authentication → Emails → SMTP Settings** → enable custom SMTP:

| Field | Value |
| --- | --- |
| Sender email | your Gmail address |
| Sender name | `Workforce` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | your Gmail address |
| Password | the app password |

Then **Authentication → Sign In / Providers → Email** → turn **Confirm email** back on, and in **Authentication → Rate Limits** raise "emails per hour" (e.g. 100).

**C. Vercel (task emails: "assigned to you", new comments)**
Vercel → your project → **Settings → Environment Variables**, add for Production:

| Name | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | your Gmail address |
| `SMTP_PASS` | the app password |
| `MAIL_FROM` | `Workforce <your Gmail address>` |

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

## Good to know

- **"Windows protected your PC"**: shown for unsigned apps. Workers click *More info → Run anyway*. Before paying customers, sign the app with a certificate (Azure Trusted Signing is the cheapest). electron-builder signs automatically once it's configured.
- **The installer** installs per user (no admin rights), adds desktop and Start-menu shortcuts, starts the app after installing, and sets it to start with Windows.
- **Mac**: needs an Apple Developer account ($99/year) and a Mac or a macOS GitHub runner for signing. Planned for later.
- **Building an installer locally** (optional): `cd apps/agent && npm run dist` → `apps/agent/release/`. On Node 26 Electron may install badly; `npm run fix:electron` repairs it, but CI uses Node 22, which avoids the problem.
