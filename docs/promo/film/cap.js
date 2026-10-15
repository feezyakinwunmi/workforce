const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"); const path = require("path");
const [format, outDir, onlyTimes, fromF, toF] = process.argv.slice(2);
const W = format === "wide" ? 1920 : 1080, H = format === "wide" ? 1080 : 1920;
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("requestfailed", (r) => errs.push("FAILED " + r.url()));
  await p.goto("file://" + path.resolve(__dirname, "promo2.html") + "?format=" + format);
  await p.evaluate(() => document.fonts.ready);
  // preload every image
  await p.evaluate(async () => { const names = ["home","overview","activity","tasks","chat","leave","expenses","timesheets","reviews","team","payroll","overview_dark","note_dark","payslip","phone_femi","phone_bayo"]; await Promise.all(names.map((n) => new Promise((res) => { const i = new Image(); i.onload = res; i.onerror = res; i.src = "img/" + n + ".png"; }))); await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  await p.waitForTimeout(500);
  if (errs.length) { console.error(errs); }
  fs.mkdirSync(outDir, { recursive: true });
  if (format === "wide" && !onlyTimes) fs.writeFileSync(path.join(__dirname, "cues.json"), JSON.stringify(await p.evaluate(() => window.CUES)));
  const times = onlyTimes && onlyTimes !== "-" ? onlyTimes.split(",").map(Number) : null;
  const n0 = fromF ? +fromF : 0, n1 = toF ? +toF : Math.round(62 * 30);
  const list = times ? times : Array.from({ length: n1 - n0 }, (_, k) => (n0 + k) / 30);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    await p.evaluate((t) => window.render(t), t);
    if (times) await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(outDir, times ? `t${t}.jpg` : String(n0 + i).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 90 });
  }
  await b.close();
})();
