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

## Good to know

- **"Windows protected your PC"**: shown for unsigned apps. Workers click *More info → Run anyway*. Before paying customers, sign the app with a certificate (Azure Trusted Signing is the cheapest). electron-builder signs automatically once it's configured.
- **The installer** installs per user (no admin rights), adds desktop and Start-menu shortcuts, starts the app after installing, and sets it to start with Windows.
- **Mac**: needs an Apple Developer account ($99/year) and a Mac or a macOS GitHub runner for signing. Planned for later.
- **Building an installer locally** (optional): `cd apps/agent && npm run dist` → `apps/agent/release/`. On Node 26 Electron may install badly; `npm run fix:electron` repairs it, but CI uses Node 22, which avoids the problem.
