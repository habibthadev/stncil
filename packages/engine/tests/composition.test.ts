import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine/index";

describe("template composition", () => {
  it("renders a registered layout with supplied and default slots", async () => {
    const engine = new Engine({ debug: false });
    engine.registerTemplate(
      "base.stn",
      '<html><head><title>@slot("title") { Default }</title></head><body>@slot("body") { Empty }</body></html>',
    );
    const result = await engine.compileAndRender(
      '@layout("base.stn") { @slot("title") { {{ title }} } @slot("body") { <p>{{ body }}</p> } }',
      { title: "<Title>", body: "<body>" },
    );
    expect(result.html).toMatch(/<title>\s*&lt;Title&gt;\s*<\/title>/);
    expect(result.html).toContain("<p>&lt;body&gt;</p>");
    expect(result.html).not.toContain("Default");
    expect(result.errors).toHaveLength(0);
  });

  it("uses slot defaults without supplied content", async () => {
    const engine = new Engine({ debug: false });
    engine.registerTemplate("base.stn", "<main>@slot body { Default body }</main>");
    const result = await engine.compileAndRender('@layout "base.stn" {}');
    expect(result.html).toContain("Default body");
  });

  it("resolves imported components relative to the calling template", async () => {
    const engine = new Engine({ debug: false });
    engine.registerTemplate(
      "pages/card.stn",
      '<article>{{ title }}|{{ private | default("isolated") }}</article>',
    );
    engine.registerTemplate(
      "pages/index.stn",
      '@import { Card } from "./card.stn" @render Card({ title: title })',
    );
    const result = await engine.render("pages/index.stn", { title: "<Ada>", private: "secret" });
    expect(result.html).toBe("<article>&lt;Ada&gt;|isolated</article>");
    expect(result.errors).toHaveLength(0);
  });

  it("passes named and spread props without mutating the caller", async () => {
    const engine = new Engine({ debug: false });
    engine.registerTemplate("card.stn", "{{ title }}|{{ count }}");
    const props = { title: "Spread", count: 2 };
    const result = await engine.compileAndRender(
      '@render Card({ ...props, title: "Named" })',
      { props },
      {
        resolveTemplate: async () =>
          (await engine.compile("{{ title }}|{{ count }}", "card.stn")).ir,
      },
    );
    expect(result.html).toBe("Named|2");
    expect(props.title).toBe("Spread");
  });

  it("reports missing templates and stops include cycles", async () => {
    const engine = new Engine({ debug: false });
    const missing = await engine.compileAndRender("@render Missing({})");
    expect(missing.errors).toHaveLength(1);
    engine.registerTemplate("cycle.stn", "@render cycle({})");
    const cycle = await engine.render("cycle.stn");
    expect(cycle.errors).toHaveLength(1);
    expect(cycle.errors[0]!.message).toMatch(/depth|cycle/i);
  });

  it("uses the same layout behavior for streamed output", async () => {
    const engine = new Engine({ debug: false });
    engine.registerTemplate("base.stn", "<main>@slot body</main>");
    engine.registerTemplate("page.stn", '@layout "base.stn" { @slot body { <p>Ready</p> } }');
    const reader = (await engine.renderStream("page.stn")).getReader();
    let html = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      html += chunk.value;
    }
    expect(html).toContain("<p>Ready</p>");
    expect(html).toContain("<main>");
  });

  it("evaluates supplied slots only when the layout uses them", async () => {
    const engine = new Engine({ debug: false });
    engine.registerTemplate("base.stn", "<main>@slot body { Default }</main>");
    const result = await engine.compileAndRender(
      '@layout "base.stn" { @slot unused { {{ 1 / 0 }} } }',
    );
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain("Default");
  });

  it("keeps slot content separate between concurrent renders", async () => {
    const engine = new Engine({ debug: false });
    engine.registerTemplate("base.stn", "<main>@slot body</main>");
    const source = '@layout "base.stn" { @slot body { {{ name }} } }';
    const [first, second] = await Promise.all([
      engine.compileAndRender(source, { name: "Ada" }),
      engine.compileAndRender(source, { name: "Grace" }),
    ]);
    expect(first.html).toContain("Ada");
    expect(first.html).not.toContain("Grace");
    expect(second.html).toContain("Grace");
    expect(second.html).not.toContain("Ada");
  });
});
