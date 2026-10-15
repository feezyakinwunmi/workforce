// Screens + element boxes for the promo. node grab.js <set>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const OUT = __dirname + '/img';
const b64 = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = `${b64('{"alg":"HS256","typ":"JWT"}')}.${b64(JSON.stringify({ sub: 'me', exp: 4102444800, role: 'authenticated' }))}.sig`;
const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'r', user: { id: 'me' } };
const ADAEZE = 'a0000000-0000-4000-8000-000000000002';
const set = process.argv[2];
const boxesFile = OUT + '/boxes.json';
const boxes = fs.existsSync(boxesFile) ? JSON.parse(fs.readFileSync(boxesFile)) : {};
async function ctxFor(browser, { w = 1440, h = 900, theme = 'light', dsf = 2, loggedIn = true, mobile = false }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, deviceScaleFactor: dsf, isMobile: mobile, hasTouch: mobile });
  if (loggedIn) await ctx.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + b64(JSON.stringify(session)), domain: 'localhost', path: '/' }]);
  await ctx.addInitScript((theme) => { try { localStorage.setItem('theme', theme); for (const k of ['a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000006']) localStorage.setItem('workbase-tour:' + k, 'x'); } catch {} }, theme);
  return ctx;
}
async function box(page, loc) { const b = await loc.first().boundingBox().catch(() => null); return b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; }
async function shot(ctx, name, route, targets = {}, before) {
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000' + route, { waitUntil: 'networkidle' });
  if (before) await before(page);
  await page.waitForTimeout(1200);
  await page.mouse.move(-10, -10);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  const b = {};
  for (const [k, sel] of Object.entries(targets)) b[k] = await box(page, typeof sel === 'string' ? page.locator(sel) : sel(page));
  boxes[name] = b;
  console.log(name, JSON.stringify(b));
  await page.close();
}
const NAV = ['overview:/dashboard', 'clock:/dashboard/clock', 'activity:/dashboard/activity', 'timesheets:/dashboard/timesheets', 'chat:/dashboard/chat', 'tasks:/dashboard/tasks', 'leave:/dashboard/leave', 'expenses:/dashboard/expenses', 'reviews:/dashboard/reviews', 'notes:/dashboard/notes', 'team:/dashboard/team', 'payroll:/dashboard/payroll', 'records:/dashboard/records'];
const navTargets = Object.fromEntries(NAV.map((s) => { const [k, h] = s.split(':'); return ['nav_' + k, `aside a[href="${h}"], nav a[href="${h}"]`]; }));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  if (set === 'desk') {
    const out = await ctxFor(browser, { loggedIn: false });
    await shot(out, 'home', '/', { cta: (p) => p.getByRole('link', { name: 'Start free trial' }), hero: 'h1' });
    const c = await ctxFor(browser, {});
    await shot(c, 'overview', '/dashboard', { ...navTargets, working: (p) => p.getByText('Working now', { exact: true }), adaeze: (p) => p.getByRole('link', { name: /Adaeze Okafor/ }), teamtable: (p) => p.getByText('Team today', { exact: true }), chart: (p) => p.getByText('Team hours, last 7 days'), ring: (p) => p.getByText('Activity today', { exact: true }), dark: 'button[aria-label*="Dark" i], button[title*="Dark" i]', bayo: (p) => p.getByText('On phone').first() });
    await shot(c, 'activity', `/dashboard/activity?user=${ADAEZE}`, { day: (p) => p.getByText('Through the day'), apps: (p) => p.getByText('Apps', { exact: true }) });
    await shot(c, 'tasks', '/dashboard/tasks', { newtask: (p) => p.getByRole('button', { name: /New task/ }), first: (p) => p.getByText('Payments API: Paystack webhooks') });
    await shot(c, 'chat', '/dashboard/chat/d0000000-0000-4000-8000-000000000003', { msgs: (p) => p.getByText('Here’s the flow diagram').or(p.getByText("Here's the flow diagram")), composer: 'textarea' });
    await shot(c, 'leave', '/dashboard/leave', { balance: (p) => p.getByText('Annual leave').first(), approve: (p) => p.getByRole('button', { name: 'Approve' }) });
    await shot(c, 'expenses', '/dashboard/expenses', { approve: (p) => p.getByRole('button', { name: /Approve/ }), receipt: (p) => p.getByText('Photo of the receipt') });
    await shot(c, 'payroll', '/dashboard/payroll', { net: (p) => p.getByText('Net pay').first(), paye: (p) => p.getByText('PAYE to remit'), issue: (p) => p.getByRole('button', { name: /payslips/i }) });
    await shot(c, 'reviews', '/dashboard/reviews', { goal: (p) => p.getByText('Sign 3 new pilot companies') });
    await shot(c, 'timesheets', '/dashboard/timesheets', { chart: (p) => p.getByText('Hours per day'), csv: (p) => p.getByRole('link', { name: /Download CSV/ }).or(p.getByRole('button', { name: /Download CSV/ })) });
    await shot(c, 'team', '/dashboard/team', { invite: (p) => p.getByText('Invite people') });
    await shot(c, 'note', '/dashboard/notes/f2000000-0000-4000-8000-000000000001', { paper: (p) => p.getByLabel('Title') });
  }
  if (set === 'slip') {
    const c = await ctxFor(browser, {});
    await shot(c, 'payslip', '/dashboard/payslips', {}, async (p) => { const a = p.locator('a[href^="/dashboard/payslips/"]').first(); await a.click(); await p.waitForLoadState('networkidle'); });
  }
  if (set === 'dark') {
    const d = await ctxFor(browser, { theme: 'dark' });
    await shot(d, 'overview_dark', '/dashboard', {});
    await shot(d, 'activity_dark', `/dashboard/activity?user=${ADAEZE}`, {});
  }
  if (set === 'ov') {
    const c = await ctxFor(browser, {});
    await shot(c, 'overview', '/dashboard', { ...navTargets, working: (p) => p.getByText('Working now', { exact: true }), adaeze: (p) => p.getByRole('link', { name: /Adaeze Okafor/ }), teamtable: (p) => p.getByText('Team today', { exact: true }), chart: (p) => p.getByText('Team hours, last 7 days'), ring: (p) => p.getByText('Activity today', { exact: true }), bayo: (p) => p.getByText('On phone').first() });
    const d = await ctxFor(browser, { theme: 'dark' });
    await shot(d, 'overview_dark', '/dashboard', {});
  }
  if (set === 'notedark') {
    const d = await ctxFor(browser, { theme: 'dark' });
    await shot(d, 'note_dark', '/dashboard/notes/f2000000-0000-4000-8000-000000000001', { paper: (p) => p.getByLabel('Title') });
  }
  if (set === 'phone') {
    const m = await ctxFor(browser, { w: 390, h: 844, dsf: 3, mobile: true });
    await shot(m, 'phone_' + (process.env.MOCK_USER || 'femi'), '/dashboard/clock', { btn: (p) => p.getByRole('button', { name: /Clock (in|out)/ }) });
  }
  fs.writeFileSync(boxesFile, JSON.stringify(boxes, null, 1));
  await browser.close();
})();
