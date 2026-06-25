import { describe, it } from "vitest";
import { RuntimeEngine } from "@stncil/runtime";
import type { IrDocument } from "@stncil/core";

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

describe("debug runtime", () => {
  it("let + interp", () => {
    const engine = new RuntimeEngine(
      makeDoc([
        {
          op: "LET",
          name: "greeting",
          value: { kind: "string", value: "hi" },
          nodeId: "n0",
        },
        {
          op: "WRITE_ESCAPED",
          path: ["greeting"],
          nodeId: "n1",
        },
      ]),
    );
    const result = engine.render({});
    console.log("output:", JSON.stringify(result.html));
    console.log("errors:", result.errors);
  });

  it("filter chain", () => {
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
    console.log("filter output:", JSON.stringify(result.html));
  });
});
