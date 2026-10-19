const { chromium } = require("/opt/npm-tools/node_modules/playwright");
const path = require("path");
(async () => {
  const b = await chromium.launch({ args: ["--allow-file-access-from-files"] });
  const p = await b.newPage();
  await p.goto("file://" + path.resolve(__dirname, "proposal.html"));
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
  await p.pdf({ path: path.join(__dirname, "Workbase-Meet-Future-Forward-6.0-Proposal.pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
  await b.close();
})();
