import { describe, it, expect, vi } from "vitest";
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
    const result = await engine.compileAndRender("@if (show) { visible } @else { hidden }", {
      show: true,
    });
    expect(result.html).toContain("visible");
  });

  it.each([
    ["false && record.value", "hidden"],
    ["true || record.value", "visible"],
  ])("short-circuits @if (%s)", async (condition, expected) => {
    const engine = new Engine({ debug: false });
    const record = {
      get value() {
        throw new Error("guarded getter should not run");
      },
    };
    const result = await engine.compileAndRender(
      `@if (${condition}) { visible } @else { hidden }`,
      { record },
    );
    expect(result.html.trim()).toBe(expected);
    expect(result.errors).toHaveLength(0);
  });

  it("handles @each blocks", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compileAndRender("@each (item in items) { [{{ item }}] }", {
      items: ["a", "b", "c"],
    });
    expect(result.html).toContain("[a]");
    expect(result.html).toContain("[b]");
    expect(result.html).toContain("[c]");
  });

  it("handles @let blocks", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compileAndRender('@let greeting = "hi" {{ greeting }}');
    expect(result.html).toBe("hi");
  });

  it.each(["__proto__", "constructor", "toString"])(
    "allows %s as an explicit local binding",
    async (name) => {
      const engine = new Engine({ debug: false });
      const result = await engine.compileAndRender(`@let ${name} = "own" {{ ${name} }}`);
      expect(result.html).toBe("own");
      expect(result.errors).toHaveLength(0);
    },
  );

  it("uses cache by default", async () => {
    const engine = new Engine({ debug: false });
    const compile = vi.spyOn(engine, "compile");
    await engine.compileAndRender("cached");
    const result = await engine.compileAndRender("cached");
    expect(result.html).toBe("cached");
    expect(compile).toHaveBeenCalledTimes(1);
  });

  it("keeps templates with colliding legacy hashes separate", async () => {
    const engine = new Engine({ debug: false });
    expect((await engine.compileAndRender("Aa")).html).toBe("Aa");
    expect((await engine.compileAndRender("BB")).html).toBe("BB");
    expect((await engine.compileAndRender("Aa")).html).toBe("Aa");
  });

  it("keeps identical source in different files separate", async () => {
    const engine = new Engine({ debug: false });
    const compile = vi.spyOn(engine, "compile");
    const source = "@style { .card { color: red; } }";
    await engine.compileAndRender(source, {}, { sourceFile: "first.stn" });
    await engine.compileAndRender(source, {}, { sourceFile: "second.stn" });
    await engine.compileAndRender(source, {}, { sourceFile: "first.stn" });

    expect(compile).toHaveBeenCalledTimes(2);
    const first = await compile.mock.results[0]!.value;
    const second = await compile.mock.results[1]!.value;
    expect(first.ir.sourceFile).toBe("first.stn");
    expect(second.ir.sourceFile).toBe("second.stn");
    expect(first.ir.scopeHash).not.toBe(second.ir.scopeHash);
  });

  it("renders newly registered content instead of stale cached output", async () => {
    const engine = new Engine({ debug: false });
    engine.registerTemplate("page.stn", "Aa");
    expect((await engine.render("page.stn")).html).toBe("Aa");
    engine.registerTemplate("page.stn", "BB");
    expect((await engine.render("page.stn")).html).toBe("BB");
  });

  it("can disable cache", async () => {
    const engine = new Engine({ cache: false, debug: false });
    const compile = vi.spyOn(engine, "compile");
    await engine.compileAndRender("no cache");
    const result = await engine.compileAndRender("no cache");
    expect(result.html).toBe("no cache");
    expect(compile).toHaveBeenCalledTimes(2);
  });

  it("can disable caching with a zero capacity", async () => {
    const engine = new Engine({ cacheSize: 0, debug: false });
    const compile = vi.spyOn(engine, "compile");
    await engine.compileAndRender("uncached");
    await engine.compileAndRender("uncached");
    expect(compile).toHaveBeenCalledTimes(2);
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
    const result = await engine.compileAndRender("{{ name | upper }}", { name: "hello" });
    expect(result.html).toBe("HELLO");
  });

  it("handles nested paths", async () => {
    const engine = new Engine({ debug: false });
    const result = await engine.compileAndRender("{{ user.name }}", { user: { name: "Alice" } });
    expect(result.html).toBe("Alice");
  });
});
