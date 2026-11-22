import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Engine } from "../packages/engine/dist/index.js";
import { context, fetchers, expected } from "../examples/fixtures.mjs";

const examples = new URL("../examples/", import.meta.url);
const output = new URL("../.stncil-examples/", import.meta.url);
await fs.mkdir(output, { recursive: true });
let failures = 0;
for (const name of (await fs.readdir(examples)).filter((name) => name.endsWith(".stn")).sort()) {
  try {
    const source = await fs.readFile(new URL(name, examples), "utf8");
    const engine = new Engine({ debug: false, fetchers, csrfToken: "example-token" });
    const result = await engine.compileAndRender(source, context, { sourceFile: name });
    assert.equal(result.errors.length, 0, result.errors.map((error) => error.message).join("; "));
    assert.ok(!result.html.includes("{#"), "A template comment leaked into output");
    assert.ok(!result.html.includes("@async"), "An async directive leaked into output");
    for (const text of expected[name] ?? [])
      assert.ok(result.html.includes(text), `Missing expected output: ${text}`);
    const html = result.html.includes("<html")
      ? result.html
      : `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500&family=Sora:wght@500&display=swap" rel="stylesheet"><link rel="stylesheet" href="../apps/examples/shared/design.css"><title>User card / stncil</title></head><body class="layout-narrow"><header class="site-header"><nav class="nav"><span class="brand"><span class="brand-sigil" aria-hidden="true">&#64;</span> stncil</span></nav></header><main class="container">${result.html}</main><footer class="footer">Rendered from local sample data.</footer></body></html>`;
    await fs.writeFile(new URL(`${name.slice(0, -4)}.html`, output), html);
    console.log(`PASS ${name} (${Buffer.byteLength(result.html)} bytes)`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
console.log(`Rendered examples: ${fileURLToPath(output)}`);
if (failures) process.exitCode = 1;
