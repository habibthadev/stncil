import { describe, expect, it, vi } from "vitest";
import { compile } from "@stncil/core";
import { RuntimeEngine } from "@stncil/runtime";
import { createExecutorState, exec } from "../../runtime/src/engine/executor";
import type { OutputOptions } from "../../runtime/src/engine/executor";
import { Engine } from "../src/engine/index";

const sources = [
  "<h1>{{ title }}</h1>@each (item in items) {<p>{{ item }}</p>}",
  '@let value = "outer"\n@if (show) { {{ value }} @let value = title\n{{ value }} } @else if (items.length > 0) { {{ items[0] }} } @else { empty }{{ value }}',
  "@each (row, i in rows) { {{ loop.index }}:{{ loop.last }} @each (cell, i in row) { {{ loop.parent.index }}.{{ i }}={{ cell }} } }{{ i }}",
  '@each (item in items) { @let value = item\n@if (show) { @let value = "private"\n{{ value }} }{{ value }} } @empty { no items }{{ value }}',
  "before@boundary { <p>{{ 1 / count }}</p> } @fallback (error) { {{ error.message }} }after",
  '{{ show && (1 / count > 0) }}|{{ show ? title : "hidden" }}|{{ title ~ count }}',
  "@json({ title: title, items: [items[0], count], safe: !show }){{ title | upper | truncate(8) }}",
  '@let object = { constructor: title, __proto__: count }\n{{ object.constructor }}{{ object["__proto__"] }}',
  "@if (show) { {{ title | unavailable }} } tail",
];

function input(show: boolean, count: number) {
  return {
    title: '<Ada> & "quoted" 🦉',
    show,
    count,
    items: ["one", "<two>"],
    rows: [["a", "b"], ["c"]],
    value: "caller",
    i: "parent",
  };
}

function interpreted(
  ir: Parameters<typeof exec>[0],
  context: Record<string, unknown>,
  options: OutputOptions = {},
) {
  const state = createExecutorState(options);
  const errors = [];
  try {
    exec(ir, context, state);
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }
  return { html: state.output, errors: errors.map((error) => [error.name, error.message]) };
}

describe("prepared rendering", () => {
  it.each(sources)("matches interpreted output, scopes, and failures for %s", async (source) => {
    const { ir } = await compile({ source, sourceFile: "program.stn", debug: false });
    const engine = new RuntimeEngine(ir);
    for (const context of [
      input(true, 2),
      input(false, 0),
      { ...input(false, 1), items: [], rows: [] },
    ]) {
      const expected = interpreted(ir.instructions, context);
      const result = engine.render(context);
      expect({
        html: result.html,
        errors: result.errors.map((error) => [error.name, error.message]),
      }).toEqual(expected);
    }
  });

  it("reads changed data and filter registries on every render", async () => {
    const { ir } = await compile({
      source: "{{ item.title | format }}@each (value in values) { {{ value }} }",
      sourceFile: "mutable.stn",
    });
    const context = { item: { title: "first" }, values: [1] };
    const filters = { format: (value: unknown) => String(value).toUpperCase() };
    const engine = new RuntimeEngine(ir, { filters });
    expect(engine.render(context).html.trim()).toBe("FIRST 1");
    context.item.title = "second";
    context.values.push(2);
    filters.format = (value) => `changed:${value}`;
    expect(engine.render(context).html.replace(/\s/g, "")).toBe("changed:second12");
    expect(
      new RuntimeEngine(ir, { filters: { format: () => "another" } }).render(context).html,
    ).toContain("another");
  });

  it("keeps literal objects and loop metadata fresh", async () => {
    const seen: unknown[] = [];
    const mutate = (value: unknown) => {
      const object = value as { value: number };
      return ++object.value;
    };
    const remember = (value: unknown) => {
      seen.push(value);
      return "";
    };
    const { ir } = await compile({
      source: "@each (item in items) { {{ {value: 0} | mutate }}{{ loop | remember }} }",
      sourceFile: "objects.stn",
    });
    const engine = new RuntimeEngine(ir, { filters: { mutate, remember } });
    expect(engine.render({ items: [1, 2] }).html.replace(/\s/g, "")).toBe("11");
    expect(seen).toMatchObject([{ index: 1 }, { index: 2 }]);
    expect(seen[0]).not.toBe(seen[1]);
  });

  it("returns root getter failures as render errors before any output", async () => {
    const { ir } = await compile({ source: "<p>{{ value }}</p>", sourceFile: "getter.stn" });
    const context = Object.defineProperty({}, "value", {
      enumerable: true,
      get() {
        throw new Error("getter failed");
      },
    });
    const result = new RuntimeEngine(ir).render(context);
    expect(result.html).toBe("");
    expect(result.errors[0]?.message).toBe("getter failed");
  });

  it("retains complete scope values for older IR that writes an empty path", async () => {
    const { ir } = await compile({ source: '@let local = "own"', sourceFile: "scope.stn" });
    const document = {
      ...ir,
      instructions: [...ir.instructions, { op: "WRITE_JSON" as const, path: [], nodeId: "whole" }],
    };
    expect(new RuntimeEngine(document).render({ initial: 1 }).html).toBe(
      '{"initial":1,"local":"own"}',
    );
  });

  it("does not read inherited array entries in sync or async loops", async () => {
    const getter = vi.fn(() => "inherited");
    const prototype = Object.defineProperty(Object.create(Array.prototype), "0", { get: getter });
    const items = Object.setPrototypeOf(new Array(1), prototype);
    const engine = new Engine({ fetchers: { load: async () => items } });
    expect(
      (
        await engine.compileAndRender("@each (item in items) { [{{ item }}] }", { items })
      ).html.trim(),
    ).toBe("[]");
    expect(
      (
        await engine.compileAndRender(
          "@async (items from load()) { @each (item in items) { [{{ item }}] } }",
        )
      ).html.trim(),
    ).toBe("[]");
    expect(getter).not.toHaveBeenCalled();
  });
});
