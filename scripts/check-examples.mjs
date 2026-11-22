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
    const engine = new Engine({ debug: false, fetchers });
    const result = await engine.compileAndRender(source, context, { sourceFile: name });
    assert.equal(result.errors.length, 0, result.errors.map((error) => error.message).join("; "));
    assert.ok(!result.html.includes("{#"), "A template comment leaked into output");
    assert.ok(!result.html.includes("@async"), "An async directive leaked into output");
    for (const text of expected[name] ?? [])
      assert.ok(result.html.includes(text), `Missing expected output: ${text}`);
    await fs.writeFile(new URL(`${name.slice(0, -4)}.html`, output), result.html);
    console.log(`PASS ${name} (${Buffer.byteLength(result.html)} bytes)`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
console.log(`Rendered examples: ${fileURLToPath(output)}`);
if (failures) process.exitCode = 1;
