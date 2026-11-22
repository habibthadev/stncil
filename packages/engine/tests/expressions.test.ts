import { describe, expect, it } from "vitest";
import { Engine } from "../src/engine/index";

describe("template expressions", () => {
  it.each([
    ["10 + 5 * 2", "20"],
    ["(10 + 5) * 2", "30"],
    ["100 / 4", "25"],
    ["10 - 2 - 3", "5"],
    ["10 % 3", "1"],
    ["-12", "-12"],
    ["-(-12)", "12"],
    ["1.5 + .5", "2"],
    ["1e2 + 2", "102"],
    ["!false", "true"],
    ['true ? "active" : "inactive"', "active"],
    ["false ? 1 : 2", "2"],
    ['"Ada" ~ " " ~ "Lovelace"', "Ada Lovelace"],
    ['"hello" | upper', "HELLO"],
    ["(1 + 2) | number_format(2)", "3.00"],
    ['[1, 2, 3] | join(" / ")', "1 / 2 / 3"],
    ['{ name: "Ada", score: 42 }.name', "Ada"],
    ["[10, 20][1]", "20"],
    ['[{name: "Ada"}][0].name', "Ada"],
    ['{name: "Ada"}|json', "{&quot;name&quot;:&quot;Ada&quot;}"],
    ['["zero", "one"][0] | upper', "ZERO"],
    ['{ "display-name": "Ada" }["display-name"]', "Ada"],
    ['"<strong>escaped</strong>"', "&lt;strong&gt;escaped&lt;/strong&gt;"],
  ])("renders {{ %s }}", async (expression, expected) => {
    const result = await new Engine({ debug: false }).compileAndRender(`{{ ${expression} }}`);
    expect(result.html).toBe(expected);
    expect(result.errors).toHaveLength(0);
  });

  it("uses the same expressions in @let and conditions", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      "@let discounted = price * (1 - discount / 100)\n@if (discounted == 80) { {{ discounted | number_format(2) }} }",
      { price: 100, discount: 20 },
    );
    expect(result.html.trim()).toBe("80.00");
    expect(result.errors).toHaveLength(0);
  });

  it("resolves dynamic own properties without traversing prototypes", async () => {
    const engine = new Engine({ debug: false });
    const record = Object.assign(Object.create({ secret: "private" }), { name: "Ada" });
    expect((await engine.compileAndRender("{{ record[key] }}", { record, key: "name" })).html).toBe(
      "Ada",
    );
    expect(
      (await engine.compileAndRender("{{ record[key] }}", { record, key: "secret" })).html,
    ).toBe("");
    expect(
      (await engine.compileAndRender(' {{ record["constructor"] }} ', { record })).html.trim(),
    ).toBe("");
  });

  it("keeps special object-literal keys as own data", async () => {
    const result = await new Engine({ debug: false }).compileAndRender(
      '{{ { "__proto__": { label: "own" } }["__proto__"].label }}',
    );
    expect(result.html).toBe("own");
    expect(Object.hasOwn(Object.prototype, "label")).toBe(false);
  });

  it.each(["1 / 0", "1 % 0", '"2" + 1', "-value"])(
    "reports invalid arithmetic instead of misleading output: %s",
    async (expression) => {
      const result = await new Engine({ debug: false }).compileAndRender(`{{ ${expression} }}`, {
        value: "text",
      });
      expect(result.html).toBe("");
      expect(result.errors).toHaveLength(1);
    },
  );

  it.each(["process.exit()", 'record.constructor("return 1")()', "1 +", "1.2.3"])(
    "rejects executable or malformed expressions: %s",
    async (expression) => {
      await expect(new Engine({ debug: false }).compile(`{{ ${expression} }}`)).rejects.toThrow();
    },
  );
});
