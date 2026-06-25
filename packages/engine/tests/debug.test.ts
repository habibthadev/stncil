import { describe, it } from "vitest";
import { Engine } from "../src/engine/index";

describe("debug", () => {
  it("check @let output", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compile('@let greeting = "hi" {{ greeting }}');
    console.log("=== @let ir ===");
    console.log(JSON.stringify(result.ir.instructions, null, 2));
    const r = await engine.compileAndRender('@let greeting = "hi" {{ greeting }}');
    console.log("=== @let output ===", JSON.stringify(r.html));
    console.log("=== @let errors ===", r.errors);
  });

  it("check filter output", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compile('{{ name | upper }}');
    console.log("=== filter ir ===");
    console.log(JSON.stringify(result.ir.instructions, null, 2));
    const r = await engine.compileAndRender('{{ name | upper }}', { name: "hello" });
    console.log("=== filter output ===", JSON.stringify(r.html));
    console.log("=== filter errors ===", r.errors);
  });
});
