import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packagesDir = path.resolve(__dirname, "..", "packages");

function addJsExtensions(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") addJsExtensions(full);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts")) {
      let content = fs.readFileSync(full, "utf-8");
      const original = content;
      content = content.replace(
        /(from\s+["'])(\.\.?\/[^"']+?)(["'])/g,
        (_m, pre, p, suf) => {
          if (p.endsWith(".js") || p.endsWith(".mjs") || p.endsWith(".cjs")) {
            return _m;
          }
          const resolved = path.resolve(path.dirname(full), p);
          if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
            return `${pre}${p}/index.js${suf}`;
          }
          return `${pre}${p}.js${suf}`;
        },
      );
      if (content !== original) {
        fs.writeFileSync(full, content);
      }
    }
  }
}

for (const pkg of ["core", "runtime", "engine"]) {
  const dist = path.join(packagesDir, pkg, "dist");
  if (fs.existsSync(dist)) {
    console.log(`Fixing imports in ${pkg}/dist`);
    addJsExtensions(dist);
  }
}
