import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine/index";

describe("output directives", () => {
  it("renders explicitly trusted HTML without changing ordinary escaping", async () => {
    const engine = new Engine({ debug: false });
    const context = { value: "<strong>trusted</strong>" };
    expect((await engine.compileAndRender('{{ value | trust("html") }}', context)).html).toBe(context.value);
    expect((await engine.compileAndRender('{{ value }}', context)).html).toBe("&lt;strong&gt;trusted&lt;/strong&gt;");
  });
  it("serializes JSON without allowing a script closing tag", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      '<script type="application/json">@json(data)</script>',
      { data: { value: "</script><script>alert(1)</script>", unicode: "\u2028\u2029" } },
    );
    expect(result.errors).toHaveLength(0);
    expect(result.html.match(/<\/script>/g)).toHaveLength(1);
    const serialized = result.html.slice(
      result.html.indexOf(">") + 1,
      result.html.lastIndexOf("</script>"),
    );
    expect(JSON.parse(serialized)).toEqual({
      value: "</script><script>alert(1)</script>",
      unicode: "\u2028\u2029",
    });
  });

  it("serializes computed expressions and missing values", async () => {
    const engine = new Engine({ debug: false });
    expect((await engine.compileAndRender("@json({ count: 1 + 2 })")).html).toBe('{"count":3}');
    expect((await engine.compileAndRender("@json(missing)")).html).toBe("null");
  });

  it("requires a caller-provided CSRF token and escapes its field value", async () => {
    const engine = new Engine({ debug: false });
    expect((await engine.compileAndRender("<form>@csrf</form>")).errors).toHaveLength(1);
    const result = await engine.compileAndRender(
      "<form>@csrf</form>",
      {},
      { csrfToken: 'token\"<>&' },
    );
    expect(result.html).toContain('name="_csrf"');
    expect(result.html).toContain('value="token&quot;&lt;&gt;&amp;"');
  });

  it("renders the CSP nonce and mapped assets safely", async () => {
    const engine = new Engine({
      debug: false,
      nonce: "nonce",
      assetManifest: { "/app.css": "/app.abc.css" },
    });
    const result = await engine.compileAndRender(
      '<link href="@asset("/app.css")"><div nonce="@nonce">text</div>',
    );
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('href="/app.abc.css"');
    expect(result.html).toContain('nonce="nonce"');
  });

  it("rejects unsafe URL schemes and unknown filters", async () => {
    const engine = new Engine({ debug: false });
    for (const value of [
      "javascript:alert(1)",
      "java\nscript:alert(1)",
      "data:text/html,<script>",
    ]) {
      expect((await engine.compileAndRender("{{ value | url }}", { value })).errors).toHaveLength(
        1,
      );
    }
    expect(
      (await engine.compileAndRender("{{ value | missing_filter }}", { value: "data" })).errors,
    ).toHaveLength(1);
    expect(
      (await engine.compileAndRender("{{ value | url }}", { value: "/docs?a=1&b=2" })).html,
    ).toBe("/docs?a=1&amp;b=2");
  });

  it("keeps custom filters scoped to each engine", async () => {
    const first = new Engine({ debug: false, filters: { brand: () => "first" } });
    const second = new Engine({ debug: false, filters: { brand: () => "second" } });
    expect((await first.compileAndRender("{{ value | brand }}", { value: "data" })).html).toBe(
      "first",
    );
    expect((await second.compileAndRender("{{ value | brand }}", { value: "data" })).html).toBe(
      "second",
    );
  });
});
