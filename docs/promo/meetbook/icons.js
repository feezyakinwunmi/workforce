// Pull the app's icon shapes out of components/icons.tsx into plain SVG strings (icons.json).
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/../../../apps/web/src/components/icons.tsx", "utf8");
const body = src.slice(src.indexOf("const PATHS = {") + 15, src.indexOf("\n};"));
const out = {};
const re = /^  (\w+): ([\s\S]*?),\n(?=  \w+: |$)/gm;
let m;
while ((m = re.exec(body + ",\n  __end: x,\n"))) {
  let v = m[2].trim();
  if (v.startsWith("(")) v = v.slice(1, -1).trim();
  v = v.replace(/<>|<\/>/g, "").replace(/\s+/g, " ").trim();
  v = v.replace(/([a-z])([A-Z])(\w*)=/g, (_, a, b, c) => `${a}-${b.toLowerCase()}${c}=`);
  out[m[1]] = v;
}
fs.writeFileSync(__dirname + "/icons.json", JSON.stringify(out));
console.log(Object.keys(out).length, "icons");
