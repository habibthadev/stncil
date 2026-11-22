import { describe, expect, it, vi } from "vitest";
import { resolvePath } from "../src/engine/context";

describe("resolvePath", () => {
  it("reads nested own properties", () => {
    expect(resolvePath(["user", "name"], { user: { name: "Ada" } })).toBe("Ada");
  });

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "does not expose inherited %s",
    (name) => {
      expect(resolvePath([name], {})).toBeUndefined();
      expect(resolvePath(["record", name], { record: {} })).toBeUndefined();
    },
  );

  it("does not invoke inherited getters", () => {
    const getSecret = vi.fn(() => "secret");
    const prototype = Object.defineProperty({}, "secret", { get: getSecret });
    const record = Object.create(prototype);
    expect(resolvePath(["record", "secret"], { record })).toBeUndefined();
    expect(getSecret).not.toHaveBeenCalled();
  });

  it("treats prototype-related names in JSON as ordinary own data", () => {
    const record = JSON.parse(
      '{"__proto__":{"label":"own"},"constructor":{"prototype":{"label":"data"}}}',
    );
    expect(resolvePath(["record", "__proto__", "label"], { record })).toBe("own");
    expect(resolvePath(["record", "constructor", "prototype", "label"], { record })).toBe("data");
  });

  it("reads null-prototype records and array indices", () => {
    const record = Object.assign(Object.create(null), { value: 0 });
    expect(resolvePath(["record", "value"], { record })).toBe(0);
    expect(resolvePath(["items", "0"], { items: [false] })).toBe(false);
    expect(resolvePath(["items", "length"], { items: [false] })).toBe(1);
  });

  it.each([null, undefined, false, 0, "text"])("stops at non-object value %s", (value) => {
    expect(resolvePath(["value", "missing"], { value })).toBeUndefined();
  });
});
