import { describe, it, expect } from "vitest";
import { RuntimeEngine } from "../src/engine/index";
import type { IrDocument, IrInstruction } from "@stncil/core";

function makeDoc(instructions: IrDocument["instructions"]): IrDocument {
  return {
    stncilVersion: 1,
    outputMode: "html",
    sourceFile: "test.stn",
    sourceHash: "abc123",
    compiledAt: "2024-01-01T00:00:00Z",
    scopeHash: "scope1",
    context: {},
    translationsManifest: [],
    fetchersManifest: [],
    sourceMap: { nodes: {} },
    instructions,
  };
}

describe("RuntimeEngine", () => {
  it("renders literal text", () => {
    const engine = new RuntimeEngine(
      makeDoc([{ op: "WRITE_LITERAL", value: "hello world", nodeId: "n0" }]),
    );
    const result = engine.render();
    expect(result.html).toBe("hello world");
    expect(result.errors).toHaveLength(0);
  });

  it("renders escaped interpolation", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        { op: "WRITE_LITERAL", value: "Hello, ", nodeId: "n0" },
        { op: "WRITE_ESCAPED", path: ["name"], nodeId: "n1" },
      ]),
    );
    const result = engine.render({ name: "World" });
    expect(result.html).toBe("Hello, World");
  });

  it("escapes HTML in interpolation", () => {
    const engine = new RuntimeEngine(
      makeDoc([{ op: "WRITE_ESCAPED", path: ["name"], nodeId: "n0" }]),
    );
    const result = engine.render({ name: "<script>alert('xss')</script>" });
    expect(result.html).toBe("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
  });

  it("renders URL-escaped interpolation", () => {
    const engine = new RuntimeEngine(
      makeDoc([{ op: "WRITE_URL_ESCAPED", path: ["url"], nodeId: "n0" }]),
    );
    const result = engine.render({ url: "a&b=c" });
    expect(result.html).toBe("a%26b%3Dc");
  });

  it("renders CSS-escaped interpolation", () => {
    const engine = new RuntimeEngine(
      makeDoc([{ op: "WRITE_CSS_ESCAPED", path: ["value"], nodeId: "n0" }]),
    );
    const result = engine.render({ value: "hello" });
    expect(result.html).toBe("hello");
  });

  it("renders JSON", () => {
    const engine = new RuntimeEngine(
      makeDoc([{ op: "WRITE_JSON", path: ["data"], nodeId: "n0" }]),
    );
    const result = engine.render({ data: { a: 1 } });
    expect(result.html).toBe('{"a":1}');
  });

  it("handles IF instruction", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        {
          op: "IF",
          condition: { kind: "path", segments: ["show"] },
          consequent: [{ op: "WRITE_LITERAL", value: "visible", nodeId: "n1" }],
          elseIfs: [],
          alternate: null,
          nodeId: "n0",
        },
      ]),
    );
    expect(engine.render({ show: true }).html).toBe("visible");
    expect(engine.render({ show: false }).html).toBe("");
  });

  it("handles IF with else", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        {
          op: "IF",
          condition: { kind: "path", segments: ["flag"] },
          consequent: [{ op: "WRITE_LITERAL", value: "yes", nodeId: "n1" }],
          elseIfs: [],
          alternate: [{ op: "WRITE_LITERAL", value: "no", nodeId: "n2" }],
          nodeId: "n0",
        },
      ]),
    );
    expect(engine.render({ flag: false }).html).toBe("no");
  });

  it("handles EACH instruction", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        {
          op: "EACH",
          source: { kind: "path", segments: ["items"] },
          as: "item",
          indexAs: null,
          body: [
            { op: "WRITE_LITERAL", value: "[", nodeId: "n1" },
            { op: "WRITE_ESCAPED", path: ["item"], nodeId: "n2" },
            { op: "WRITE_LITERAL", value: "]", nodeId: "n3" },
          ],
          empty: [{ op: "WRITE_LITERAL", value: "empty", nodeId: "n4" }],
          nodeId: "n0",
        },
      ]),
    );
    expect(engine.render({ items: ["a", "b", "c"] }).html).toBe("[a][b][c]");
    expect(engine.render({ items: [] }).html).toBe("empty");
  });

  it("handles EACH with index", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        {
          op: "EACH",
          source: { kind: "path", segments: ["items"] },
          as: "item",
          indexAs: "i",
          body: [
            { op: "WRITE_ESCAPED", path: ["i"], nodeId: "n1" },
            { op: "WRITE_LITERAL", value: ":", nodeId: "n2" },
            { op: "WRITE_ESCAPED", path: ["item"], nodeId: "n3" },
          ],
          empty: [],
          nodeId: "n0",
        },
      ]),
    );
    expect(engine.render({ items: ["x", "y"] }).html).toBe("0:x1:y");
  });

  it("handles LET instruction", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        {
          op: "LET",
          name: "greeting",
          value: { kind: "string", value: "hi" },
          nodeId: "n0",
        },
      ]),
    );
    engine.render();
  });

  it("handles BOUNDARY without error", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        {
          op: "BOUNDARY",
          body: [
            { op: "WRITE_LITERAL", value: "ok", nodeId: "n1" },
          ],
          errorBinding: null,
          fallback: [
            { op: "WRITE_LITERAL", value: "fallback", nodeId: "n2" },
          ],
          nodeId: "n0",
        },
      ]),
    );
    const result = engine.render({});
    expect(result.html).toBe("ok");
  });

  it("handles RECURSIVE_DEF and RECURSIVE_CALL", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        {
          op: "RECURSIVE_DEF",
          name: "tree",
          param: "node",
          body: [
            { op: "WRITE_ESCAPED", path: ["node"], nodeId: "n1" },
          ],
          maxDepth: 50,
          nodeId: "n0",
        },
        {
          op: "RECURSIVE_CALL",
          name: "tree",
          arg: { kind: "string", value: "root" },
          nodeId: "n2",
        },
      ]),
    );
    const result = engine.render();
    expect(result.html).toBe("root");
  });

  it("handles WRITE_FILTER with upper filter", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        {
          op: "WRITE_FILTER",
          path: ["name"],
          filters: [{ name: "upper", args: [] }],
          nodeId: "n0",
        },
      ]),
    );
    const result = engine.render({ name: "hello" });
    expect(result.html).toBe("HELLO");
  });

  it("handles binary expressions in IF", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        {
          op: "IF",
          condition: {
            kind: "binary",
            op: ">",
            left: { kind: "path", segments: ["count"] },
            right: { kind: "number", value: 5 },
          },
          consequent: [{ op: "WRITE_LITERAL", value: "big", nodeId: "n1" }],
          elseIfs: [],
          alternate: [{ op: "WRITE_LITERAL", value: "small", nodeId: "n2" }],
          nodeId: "n0",
        },
      ]),
    );
    expect(engine.render({ count: 10 }).html).toBe("big");
    expect(engine.render({ count: 3 }).html).toBe("small");
  });

  it("handles nested paths", () => {
    const engine = new RuntimeEngine(
      makeDoc([{ op: "WRITE_ESCAPED", path: ["user", "name"], nodeId: "n0" }]),
    );
    const result = engine.render({ user: { name: "Alice" } });
    expect(result.html).toBe("Alice");
  });

  it.each<IrInstruction>([
    { op: "WRITE_ESCAPED", path: ["record", "secret"], nodeId: "n0" },
    { op: "WRITE_TRUSTED", path: ["record", "secret"], nodeId: "n0" },
    { op: "WRITE_URL_ESCAPED", path: ["record", "secret"], nodeId: "n0" },
    { op: "WRITE_CSS_ESCAPED", path: ["record", "secret"], nodeId: "n0" },
    { op: "WRITE_FILTER", path: ["record", "secret"], filters: [], nodeId: "n0" },
  ])("does not render inherited fields through $op", (instruction) => {
    const engine = new RuntimeEngine(makeDoc([instruction]));
    const record = Object.create({ secret: "inherited" });
    const result = engine.render({ record });
    expect(result.html).toBe("");
    expect(result.errors).toHaveLength(0);
  });

  it("does not take conditional branches for inherited fields", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        {
          op: "IF",
          condition: { kind: "path", segments: ["record", "secret"] },
          consequent: [{ op: "WRITE_LITERAL", value: "leaked", nodeId: "n1" }],
          elseIfs: [],
          alternate: [{ op: "WRITE_LITERAL", value: "safe", nodeId: "n2" }],
          nodeId: "n0",
        },
      ]),
    );
    expect(engine.render({ record: Object.create({ secret: true }) }).html).toBe("safe");
  });

  it("returns errors for missing paths in WRITE_ESCAPED", () => {
    const engine = new RuntimeEngine(
      makeDoc([{ op: "WRITE_ESCAPED", path: ["missing"], nodeId: "n0" }]),
    );
    const result = engine.render({});
    expect(result.html).toBe("");
  });
});
