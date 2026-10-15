const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const fs = require("fs"); const path = require("path");
(async () => {
  const html = fs.readFileSync(path.join(__dirname, "posts.html"), "utf8").replace("__ICONS__", fs.readFileSync(path.join(__dirname, "icons.json"), "utf8"));
  fs.writeFileSync(path.join(__dirname, "posts.built.html"), html);
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const p = await b.newPage({ viewport: { width: 1300, height: 2000 } });
  p.on("pageerror", (e) => console.error(e));
  await p.goto("file://" + path.join(__dirname, "posts.built.html"));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);
  fs.mkdirSync(path.join(__dirname, "posts"), { recursive: true });
  for (const el of await p.$$(".post")) {
    const id = await el.getAttribute("id");
    await el.screenshot({ path: path.join(__dirname, "posts", `Workbase-${id}.png`) });
  }
  await b.close();
})();
