// node shoot.js → out/post-1.png … post-5.png (1080 x 1350)
const { chromium } = require("/opt/npm-tools/node_modules/playwright");
const path = require("path"); const fs = require("fs");
(async () => {
  const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  p.on("pageerror", (e) => console.error(String(e)));
  fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
  const names = ["", "Meet-network", "Meet-guests", "Book-get-paid", "Book-pricing", "One-account"];
  for (let n = 1; n <= 5; n++) {
    await p.goto("file://" + path.resolve(__dirname, "films.html") + `?film=post&n=${n}&format=post`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, "out", `Post-${n}-${names[n]}.png`) });
  }
  await b.close();
})();
