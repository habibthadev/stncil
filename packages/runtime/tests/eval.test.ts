import { describe, expect, it, vi } from "vitest";
import type { IrExpr } from "@stncil/core";
import { evalExpr } from "../src/engine/eval";
import { filters, registerFilter } from "../src/filters/index";

function binary(op: "&&" | "||", left: IrExpr, right: IrExpr): IrExpr {
  return { kind: "binary", op, left, right };
}

describe("logical expressions", () => {
  it.each(["&&", "||"] as const)("short-circuits %s before reading the right side", (op) => {
    const read = vi.fn(() => {
      throw new Error("guarded getter should not run");
    });
    const record = Object.defineProperty({}, "value", { get: read });
    const left = op === "||";
    const expr = binary(
      op,
      { kind: "boolean", value: left },
      { kind: "path", segments: ["record", "value"] },
    );

    expect(evalExpr(expr, { record })).toBe(left);
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["&&", "||"] as const)("evaluates a required %s right side once", (op) => {
    const read = vi.fn(() => "truthy");
    const record = Object.defineProperty({}, "value", { get: read });
    const expr = binary(
      op,
      { kind: "boolean", value: op === "&&" },
      { kind: "path", segments: ["record", "value"] },
    );

    expect(evalExpr(expr, { record })).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it.each(["&&", "||"] as const)("does not invoke a short-circuited %s filter", (op) => {
    const filter = vi.fn(() => {
      throw new Error("guarded filter should not run");
    });
    registerFilter("guarded_test_filter", filter);
    try {
      const left = op === "||";
      const expr = binary(
        op,
        { kind: "boolean", value: left },
        {
          kind: "filter_chain",
          expr: { kind: "string", value: "data" },
          filters: [{ name: "guarded_test_filter", args: [] }],
        },
      );
      expect(evalExpr(expr, {})).toBe(left);
      expect(filter).not.toHaveBeenCalled();
    } finally {
      delete filters["guarded_test_filter"];
    }
  });

  it.each([
    ["&&", null, true, false],
    ["&&", 0, true, false],
    ["&&", "", true, false],
    ["&&", "left", "right", true],
    ["&&", true, 0, false],
    ["||", "left", "right", true],
    ["||", null, "right", true],
    ["||", 0, "", false],
  ] as const)("returns a boolean for %s with %s and %s", (op, left, right, expected) => {
    const expr = binary(
      op,
      { kind: "path", segments: ["left"] },
      { kind: "path", segments: ["right"] },
    );
    expect(evalExpr(expr, { left, right })).toBe(expected);
  });

  it("preserves left-to-right order in nested logical expressions", () => {
    const calls: string[] = [];
    const record = {
      get first() {
        calls.push("first");
        return false;
      },
      get second() {
        calls.push("second");
        return true;
      },
      get third() {
        calls.push("third");
        return true;
      },
    };
    const path = (name: string): IrExpr => ({ kind: "path", segments: ["record", name] });
    const expr = binary("&&", binary("||", path("first"), path("second")), path("third"));
    expect(evalExpr(expr, { record })).toBe(true);
    expect(calls).toEqual(["first", "second", "third"]);
  });
});
