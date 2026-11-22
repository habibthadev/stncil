import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine/index";

describe("declared context types", () => {
  it("preserves own prototype-named fields in declarations and data", async () => {
    const engine = new Engine({ strict: true });
    const source =
      "@context { item: { __proto__: number, constructor: string } }{{ item.__proto__ }}{{ item.constructor }}";
    const compiled = await engine.compile(source);
    const item = compiled.ir.context.item;
    expect(item?.kind).toBe("object");
    if (item?.kind !== "object") return;
    expect(Object.hasOwn(item.fields, "__proto__")).toBe(true);
    expect(compiled.typeDefinition).toContain("__proto__: number");
    const result = await engine.compileAndRender(source, {
      item: JSON.parse('{"__proto__":3,"constructor":"own"}'),
    });
    expect(result.html).toBe("3own");
    expect(result.errors).toHaveLength(0);
  });

  it("rejects inherited fields during strict template checking", async () => {
    await expect(
      new Engine({ strict: true }).compile(
        "@context { item: { name: string } }{{ item.constructor }}",
      ),
    ).rejects.toThrow('Property "constructor"');
  });
  it("compiles and renders the documented nested array contract in strict mode", async () => {
    const engine = new Engine({ strict: true, debug: false });
    const source =
      "@context { title: string, posts: { title: string, body: string, author: string }[], user?: { name: string, avatar?: string } }<h1>{{ title }}</h1>@each (post in posts) {<p>{{ post.title }}</p>}";
    const compiled = await engine.compile(source, "listing.stn");
    expect(compiled.typeDefinition).toContain("Array<");
    expect(compiled.typeDefinition).toContain("avatar?: string");
    const result = await engine.compileAndRender(source, {
      title: "Notes",
      posts: [{ title: "<Ada>", body: "A note", author: "Ada" }],
    });
    expect(result.errors).toHaveLength(0);
    expect(result.html).toBe("<h1>Notes</h1><p>&lt;Ada&gt;</p>");
  });

  it("keeps grouped nullable array items in the emitted contract", async () => {
    const result = await new Engine({ strict: true }).compile(
      "@context { values: (number | null)[] }",
      "values.stn",
    );
    expect(result.ir.context.values).toEqual({
      kind: "array",
      item: { kind: "nullable", inner: { kind: "number" } },
    });
    expect(result.typeDefinition).toContain("Array<number | null>");
  });
});
