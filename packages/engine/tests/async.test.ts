import { describe, expect, it, vi } from "vitest";
import { Engine } from "../src/engine/index";

describe("async rendering", () => {
  it("renders registered fetcher results and escapes their data", async () => {
    const fetchUser = vi.fn(async () => ({ name: "<Ada>" }));
    const engine = new Engine({ debug: false, fetchers: { fetchUser } });
    const result = await engine.compileAndRender(
      "@async (user from fetchUser(userId)) { <h1>{{ user.name }}</h1> }",
      { userId: 7 },
    );
    expect(result.html.trim()).toBe("<h1>&lt;Ada&gt;</h1>");
    expect(result.errors).toHaveLength(0);
    expect(fetchUser.mock.calls[0]![0]).toBe(7);
  });

  it("supports the documented assignment syntax and literal arguments", async () => {
    const engine = new Engine({
      debug: false,
      fetchers: {
        fetchPosts: async (options) => [{ title: `Limit ${options.limit}` }],
      },
    });
    const result = await engine.compileAndRender(
      "@async (posts = fetchPosts({ limit: 10 })) { @each (post in posts) { {{ post.title }} } }",
    );
    expect(result.html.trim()).toBe("Limit 10");
    expect(result.errors).toHaveLength(0);
  });

  it("uses an error branch for fetch failures", async () => {
    const engine = new Engine({
      debug: false,
      fetchers: {
        fail: async () => {
          throw new Error("<unavailable>");
        },
      },
    });
    const result = await engine.compileAndRender(
      "@async (data from fail()) { success } @error (err) { {{ err.message }} }",
    );
    expect(result.html.trim()).toBe("&lt;unavailable&gt;");
    expect(result.errors).toHaveLength(0);
  });

  it("reports unregistered fetchers", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      "@async (data from missing()) { {{ data }} }",
    );
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("missing");
  });

  it("starts siblings together and streams earlier HTML before they finish", async () => {
    let resolveFirst;
    let resolveSecond;
    const first = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const second = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveSecond = resolve;
        }),
    );
    const engine = new Engine({ debug: false, fetchers: { first, second } });
    engine.registerTemplate(
      "page.stn",
      "begin@async (a from first()) { {{ a }} }/@async (b from second()) { {{ b }} }end",
    );
    const reader = (await engine.renderStream("page.stn")).getReader();
    expect((await reader.read()).value).toBe("begin");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    resolveSecond("two");
    resolveFirst("one");
    let remaining = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      remaining += chunk.value;
    }
    expect(remaining.replace(/\s/g, "")).toBe("one/twoend");
  });

  it("renders async bodies inside conditions and loops with isolated scope", async () => {
    const engine = new Engine({ debug: false, fetchers: { echo: async (value) => value } });
    const result = await engine.compileAndRender(
      "@each (item in items) { @if (item > 0) { @async (value from echo(item)) { {{ value }}:{{ loop.index }}; } } }|{{ value }}",
      { items: [1, 2] },
    );
    expect(result.html.replace(/\s/g, "")).toBe("1:1;2:2;|");
    expect(result.errors).toHaveLength(0);
  });

  it("falls back atomically when async work fails inside a boundary", async () => {
    const engine = new Engine({
      debug: false,
      fetchers: {
        fail: async () => {
          throw new Error("unavailable");
        },
      },
    });
    const result = await engine.compileAndRender(
      "@boundary { <div>@async (data from fail()) { {{ data }} }</div> } @fallback (err) { {{ err.message }} }",
    );
    expect(result.html.trim()).toBe("unavailable");
    expect(result.html).not.toContain("<div>");
    expect(result.errors).toHaveLength(0);
  });

  it("signals cancellation to pending fetchers", async () => {
    let observedSignal;
    const engine = new Engine({
      debug: false,
      fetchers: {
        pending: (...args) => {
          observedSignal = args.at(-1).signal;
          return new Promise(() => {});
        },
      },
    });
    engine.registerTemplate("page.stn", "before@async (data from pending()) { {{ data }} }");
    const reader = (await engine.renderStream("page.stn")).getReader();
    await reader.read();
    await reader.cancel();
    expect(observedSignal.aborted).toBe(true);
  });

  it("rejects stream reads on evaluation errors instead of closing an errored controller", async () => {
    const engine = new Engine({ debug: false });
    engine.registerTemplate("bad.stn", "{{ 1 / 0 }}");
    const stream = await engine.renderStream("bad.stn");
    await expect(stream.getReader().read()).rejects.toThrow("Division by zero");
  });

  it("finishes a pending read when the consumer cancels", async () => {
    const engine = new Engine({ debug: false, fetchers: { pending: () => new Promise(() => {}) } });
    engine.registerTemplate("page.stn", "@async (data from pending()) { {{ data }} }");
    const reader = (await engine.renderStream("page.stn")).getReader();
    const read = reader.read();
    await reader.cancel();
    expect((await read).done).toBe(true);
  });
});
