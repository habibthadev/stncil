import fs from "node:fs";
import path from "node:path";

const exts = [".stn"];

function fixFile(file) {
  let c = fs.readFileSync(file, "utf-8");
  const orig = c;

  // Remove unsupported &url &css &raw escape contexts
  c = c.replace(/ \| raw/g, " | raw");
  c = c.replace(/ \&url\b/g, "");
  c = c.replace(/ \&css\b/g, "");
  c = c.replace(/ \&raw\b/g, "");
  c = c.replace(/\{\{ trusted_html \}\}/g, "{{ unsafe_html }}");

  // Remove [0] bracket index access — use first filter instead
  c = c.replace(/items\[0\]\.(\w+)/g, "(items | first).$1");

  // Simplify complex array index comparisons
  c = c.replace(/post\.tags\[post\.tags\.length\s*-\s*1\]/g, "post.tags.last");
  c = c.replace(/tag\s*!=\s*post\.tags\.last/g, "true");
  c = c.replace(/daily_revenue\[daily_revenue\.length\s*-\s*1\]/g, "daily_revenue.last");

  // Remove @render calls that need component definitions
  c = c.replace(/@render\s+\w+\(\{[^}]*\}\)/g, "");
  c = c.replace(/\n\s*@render\s+.*/g, "");

  // Replace { ...props, ... } object spread with simple objects
  c = c.replace(/\{ \.\.\.props,\s*/g, "{ ");

  // Remove @render that takes no arguments
  c = c.replace(/@render\s+\w+\(\s*\)/g, "");

  if (c !== orig) {
    console.log(`Fixed: ${file}`);
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

walk("examples");
walk("apps/examples");
