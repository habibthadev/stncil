import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Engine } from "../src/engine/index";

describe("literal markup", () => {
  it("preserves spaces and line breaks around interpolation", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      "  {{ name }} / stncil\n{{ name }} {{ name }}  ",
      { name: "Ada" },
    );
    expect(result.html).toBe("  Ada / stncil\nAda Ada  ");
  });
  it("renders an empty template without an error", async () => {
    const result = await new Engine({ debug: false }).compileAndRender("");
    expect(result.html).toBe("");
    expect(result.errors).toHaveLength(0);
  });
  it("preserves at-signs in font and package URLs", async () => {
    const source =
      '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600"><script src="https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.min.js"></script>';
    expect((await new Engine({ debug: false }).compileAndRender(source)).html).toBe(source);
  });
  it("preserves quoted attributes and whitespace", async () => {
    const source =
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<div style="display: flex; gap: 1rem;" aria-label="Task actions">content</div>';
    const result = await new Engine({ debug: false }).compileAndRender(source);
    expect(result.html).toBe(source);
    expect(result.errors).toHaveLength(0);
  });

  it.each(['"', "'"])("renders escaped data inside %s attributes", async (quote) => {
    const source = `<input value=${quote}{{ value }}${quote}>`;
    const result = await new Engine({ debug: false }).compileAndRender(source, {
      value: '\" autofocus onfocus=\"alert(1)\'&<',
    });
    expect(result.html).toBe(
      `<input value=${quote}&quot; autofocus onfocus=&quot;alert(1)&#39;&amp;&lt;${quote}>`,
    );
    expect(result.errors).toHaveLength(0);
  });

  it("evaluates directives inside quoted attributes", async () => {
    const source =
      '<p style="padding: 1rem; @if (border) { border-top: 1px solid; } color: red;">text</p>';
    const engine = new Engine({ debug: false });
    const enabled = await engine.compileAndRender(source, { border: true });
    const disabled = await engine.compileAndRender(source, { border: false });
    expect(enabled.html).toMatch(/style="padding: 1rem;\s+border-top: 1px solid;\s+color: red;"/);
    expect(disabled.html).not.toContain("border-top");
    expect(enabled.html).not.toContain("@if");
    expect(enabled.errors).toHaveLength(0);
  });

  it.each(["@* ignored @if (false) { nope } *@", "{# ignored @let invalid #}"])(
    "removes template comments: %s",
    async (comment) => {
      const result = await new Engine({ debug: false }).compileAndRender(`before ${comment} after`);
      expect(result.html).toBe("before  after");
    },
  );

  it("preserves email addresses and allows an escaped sigil", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      '<a href="mailto:ada@example.com">ada@example.com</a> @@if @@',
    );
    expect(result.html).toBe('<a href="mailto:ada@example.com">ada@example.com</a> @if @');
  });

  it("preserves quotes and at-rules in CSS", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      '@style { .label::after { content: "}"; } @media (max-width: 400px) { .label { color: red; } } }',
    );
    expect(result.html).toContain('content: "}";');
    expect(result.html).toContain("@media (max-width: 400px)");
    expect(result.errors).toHaveLength(0);
  });

  it("keeps expression strings distinct from markup", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      '@let greeting = "hello"\n<p title="{{ greeting }}">{{ greeting }}</p>',
    );
    expect(result.html.trim()).toBe('<p title="hello">hello</p>');
  });

  it("renders the notification email with valid style attributes", async () => {
    const source = readFileSync(
      new URL("../../../apps/examples/api-email/views/notification.stn", import.meta.url),
      "utf8",
    );
    const result = await new Engine({ debug: false }).compileAndRender(source, {
      subject: "A report is ready",
      type: "info",
      message: "Ready to read.",
      timestamp: new Date(2026, 5, 24),
      details: [
        { label: "Rows", value: "10" },
        { label: "Time", value: "1s" },
      ],
    });
    expect(result.errors).toHaveLength(0);
    expect(result.html).toContain('style="padding: 8px 12px;');
    expect(result.html.match(/border-top: 1px solid #f1f5f9/g)).toHaveLength(1);
    expect(result.html).not.toContain("@if");
    expect(result.html).not.toContain("{{");
  });

  it.each(["@constructor", "@__proto__", "{# unclosed", '@let value = "unclosed'])(
    "rejects malformed template source: %s",
    async (source) => {
      await expect(new Engine({ debug: false }).compile(source)).rejects.toThrow();
    },
  );
});
