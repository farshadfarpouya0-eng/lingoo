import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const root = "src/app/admin";
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith(".tsx") && e.name !== "layout.tsx") files.push(p);
  }
}
await walk(root);
let n = 0;
for (const f of files) {
  const before = await readFile(f, "utf8");
  let s = before;
  s = s.replace(/^[ \t]*import[ \t]+AdminShell[^\n]*\r?\n?/m, "");
  s = s.replace(/<AdminShell(\s[^>]*)?>/g, "<>");
  s = s.replace(/<\/AdminShell>/g, "</>");
  if (s !== before) { await writeFile(f, s); console.log("fixed :", f); n++; }
}
console.log(`\n${n} file(s) updated. AdminShell stays only in layout.tsx.`);
