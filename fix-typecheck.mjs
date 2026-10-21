import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const roots = ["src/app", "src/components"];
const files = [];
async function walk(d){ for (const e of await readdir(d,{withFileTypes:true})){ const p = join(d, e.name); if (e.isDirectory()) await walk(p); else if (p.endsWith(".tsx")) files.push(p); } }
for (const r of roots) await walk(r).catch(()=>{});
let n = 0;
for (const f of files) {
  const before = await readFile(f, "utf8");
  const after = before.replace(/action=\{([A-Za-z_$][\w$]*)\}/g, "action={$1 as unknown as (fd: FormData) => Promise<void>}");
  if (after !== before) { await writeFile(f, after); console.log("fixed:", f); n++; }
}
console.log(n + " file(s) updated");
