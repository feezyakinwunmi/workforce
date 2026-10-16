// node cap.js <meet|book|flow> <wide|tall> <outDir> [times]  → frames (30 fps) + <film>-cues.json
const { chromium } = require("/opt/npm-tools/node_modules/playwright");
const fs = require("fs"); const path = require("path");
const [film, format, outDir, onlyTimes] = process.argv.slice(2);
const W = format === "wide" ? 1920 : 1080, H = format === "wide" ? 1080 : 1920;
(async () => {
  const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("requestfailed", (r) => errs.push("FAILED " + r.url()));
  await p.goto("file://" + path.resolve(__dirname, "films.html") + `?film=${film}&format=${format}`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  if (errs.length) console.error(errs);
  fs.mkdirSync(outDir, { recursive: true });
  const dur = await p.evaluate(() => window.DUR);
  if (!onlyTimes) fs.writeFileSync(path.join(__dirname, `${film}-cues.json`), JSON.stringify(await p.evaluate(() => ({ dur: window.DUR, sections: window.SECTIONS, cues: window.CUES }))));
  const list = onlyTimes ? onlyTimes.split(",").map(Number) : Array.from({ length: Math.round(dur * 30) }, (_, k) => k / 30);
  for (let i = 0; i < list.length; i++) {
    await p.evaluate((t) => window.render(t), list[i]);
    await p.screenshot({ path: path.join(outDir, onlyTimes ? `t${list[i]}.jpg` : String(i).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 90 });
  }
  if (errs.length) console.error(errs);
  await b.close();
})();
