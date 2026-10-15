const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"); const path = require("path");
const [format, outDir, onlyTimes] = process.argv.slice(2);
const H = format === "square" ? 1080 : format === "feed" ? 1350 : 1920;
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1080, height: H } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e)));
  await p.goto("file://" + path.resolve(__dirname, "promo.html") + "?format=" + format);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  if (errs.length) { console.error(errs); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });
  const times = onlyTimes ? onlyTimes.split(",").map(Number) : null;
  const n = times ? times.length : Math.round(22 * 30);
  for (let i = 0; i < n; i++) {
    const t = times ? times[i] : i / 30;
    await p.evaluate((t) => window.render(t), t);
    await p.screenshot({ path: path.join(outDir, times ? `t${t}.jpg` : String(i).padStart(4, "0") + ".jpg"), type: "jpeg", quality: 92 });
  }
  await b.close();
})();
