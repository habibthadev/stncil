import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine/index";

describe("render scopes", () => {
  it("restores bindings after a conditional block", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      '@let name = "outer"\n@if (true) { @let name = "inner" {{ name }} }|{{ name }}',
    );
    expect(result.html.replace(/\s/g, "")).toBe("inner|outer");
  });

  it("lets iteration bindings shadow parent locals", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      '@let item = "outer"\n@each (item in items) { {{ item }} }|{{ item }}',
      { items: ["a", "b"] },
    );
    expect(result.html.replace(/\s/g, "")).toBe("ab|outer");
  });

  it("isolates locals between iterations", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      '@each (item, index in items) { @if (index == 0) { @let local = "private" }{{ local | default("clear") }} }',
      { items: [1, 2] },
    );
    expect(result.html.replace(/\s/g, "")).toBe("clearclear");
  });

  it("provides loop position and parent metadata", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      "@each (row in rows) { {{ loop.index }}:{{ loop.first }}:{{ loop.last }}:{{ loop.length }} @each (cell in row) { [{{ loop.parent.index }}.{{ loop.index0 }}={{ cell }}] } }",
      { rows: [["a", "b"], ["c"]] },
    );
    expect(result.html.replace(/\s/g, "")).toBe(
      "1:true:false:2[1.0=a][1.1=b]2:false:true:2[2.0=c]",
    );
  });

  it("does not mutate caller data or leak locals across renders", async () => {
    const engine = new Engine({ debug: false });
    const context = { name: "caller" };
    await engine.compileAndRender('@let name = "local" {{ name }}', context);
    expect(context.name).toBe("caller");
    expect((await engine.compileAndRender("{{ name }}", context)).html).toBe("caller");
  });

  it("discards partial output when a boundary falls back", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      "before@boundary { <strong>{{ 1 / 0 }}</strong> } @fallback (err) { fallback:{{ err.message }} }after",
    );
    expect(result.html).toContain("fallback:Division by zero");
    expect(result.html).not.toContain("<strong>");
    expect(result.errors).toHaveLength(0);
  });
});
