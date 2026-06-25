import fs from "node:fs";
import path from "node:path";

const root = process.argv[2] || ".";
const exts = [".stn"];

function fixFile(file) {
  let c = fs.readFileSync(file, "utf-8");
  const orig = c;
  c = c.replace(/\| date_format: "([^"]+)"/g, '| date_format("$1")');
  c = c.replace(/\| default: "([^"]*)"/g, '| default("$1")');
  c = c.replace(/\| default: '([^']*)'/g, "| default('$1')");
  c = c.replace(/\| truncate: (\d+)/g, "| truncate($1)");
  c = c.replace(/\| join: "([^"]+)"/g, '| join("$1")');
  c = c.replace(/\| number_format: "([^"]+)"/g, "| number_format($1)");
  c = c.replace(/\|\s*where[^|]*\|/g, "|");
  c = c.replace(/where: "[^"]+",\s*"[^"]+"\s*\|\s*/g, "");
  c = c.replace(/\| url_encode/g, "");
  if (c !== orig) {
    console.log(`Fixed: ${path.relative(root, file)}`);
    fs.writeFileSync(file, c);
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") walk(full);
    else if (exts.includes(path.extname(entry.name))) fixFile(full);
  }
}

walk(root);
