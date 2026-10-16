// node shoot.js [url] → out/*.png  (posts 1080×1350, billboards 1600×1000)
const { chromium } = require("/opt/npm-tools/node_modules/playwright");
const path = require("path"); const fs = require("fs");
const url = process.argv[2] ? `&url=${encodeURIComponent(process.argv[2])}` : "";
(async () => {
  const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
  const file = "file://" + path.resolve(__dirname, "versus.html");
  const jobs = [
    ["n=1", "Versus-1-Google-Meet", 1080, 1350], ["n=2", "Versus-2-Zoom", 1080, 1350],
    ["n=3", "Versus-3-Free-plans", 1080, 1350], ["n=4", "Versus-4-And-now-Lagos", 1080, 1350],
    ["b=1", "Billboard-1-Google", 1600, 1000], ["b=2", "Billboard-2-Zoom", 1600, 1000],
  ];
  for (const [qs, name, w, h] of jobs) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on("pageerror", (e) => console.error(name, String(e)));
    await p.goto(`${file}?${qs}${url}`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(__dirname, "out", `${name}.png`) });
    const over = await p.evaluate(() => [document.documentElement.scrollHeight, document.documentElement.scrollWidth]);
    console.log(name, over.join("x"));
    await p.close();
  }
  await b.close();
})();
