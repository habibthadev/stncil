import { describe, it, expect } from "vitest";
import { Engine } from "../src/engine/index";

describe("Engine", () => {
  it("compiles and renders simple template", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compileAndRender("hello world");
    expect(result.html).toBe("hello world");
    expect(result.errors).toHaveLength(0);
  });

  it("compiles and renders with context", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compileAndRender("Hello, {{ name }}!", {
      name: "World",
    });
    expect(result.html).toBe("Hello, World!");
  });

  it("escapes HTML in context values", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compileAndRender("{{ value }}", {
      value: "<script>alert('xss')</script>",
    });
    expect(result.html).toContain("&lt;script&gt;");
  });

  it("handles @if blocks", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compileAndRender(
      "@if (show) { visible } @else { hidden }",
      { show: true },
    );
    expect(result.html).toContain("visible");
  });

  it("handles @each blocks", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compileAndRender(
      "@each (item in items) { [{{ item }}] }",
      { items: ["a", "b", "c"] },
    );
    expect(result.html).toContain("[a]");
    expect(result.html).toContain("[b]");
    expect(result.html).toContain("[c]");
  });

  it("handles @let blocks", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compileAndRender(
      '@let greeting = "hi" {{ greeting }}',
    );
    expect(result.html).toBe("hi");
  });

  it("uses cache by default", async () => {
    const engine = new Engine({ debug: false });
    await engine.compileAndRender("cached");
    const result = await engine.compileAndRender("cached");
    expect(result.html).toBe("cached");
  });

  it("can disable cache", async () => {
    const engine = new Engine({ cache: false, debug: false });
    const result = await engine.compileAndRender("no cache");
    expect(result.html).toBe("no cache");
  });

  it("registerTemplate stores template", async () => {
    const engine = new Engine({ debug: false });
    engine.registerTemplate("greeting.stn", "hello");
    const result = await engine.render("greeting.stn");
    expect(result.html).toBe("hello");
  });

  it("compile returns full result with typeDefinition", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compile("hello");
    expect(result.ir).toBeDefined();
    expect(result.typeDefinition).toBeDefined();
    expect(result.warnings).toBeDefined();
  });

  it("handles filter chains", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compileAndRender(
      '{{ name | upper }}',
      { name: "hello" },
    );
    expect(result.html).toBe("HELLO");
  });

  it("handles nested paths", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compileAndRender(
      "{{ user.name }}",
      { user: { name: "Alice" } },
    );
    expect(result.html).toBe("Alice");
  });
});
