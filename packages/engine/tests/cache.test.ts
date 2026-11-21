import { describe, it, expect } from "vitest";
import { CompilerCache } from "../src/cache/index";
import type { IrDocument } from "@stncil/core";

function makeIr(): IrDocument {
  return {
    stncilVersion: 1,
    outputMode: "html",
    sourceFile: "test.stn",
    sourceHash: "abc",
    compiledAt: "2024-01-01T00:00:00Z",
    scopeHash: "s1",
    context: {},
    translationsManifest: [],
    fetchersManifest: [],
    sourceMap: { nodes: {} },
    instructions: [],
  };
}

describe("CompilerCache", () => {
  it("stores and retrieves entries", () => {
    const cache = new CompilerCache();
    const ir = makeIr();
    cache.set("hash1", ir);
    expect(cache.get("hash1")).toBe(ir);
  });

  it("returns undefined for missing keys", () => {
    const cache = new CompilerCache();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("has returns correct status", () => {
    const cache = new CompilerCache();
    expect(cache.has("h")).toBe(false);
    cache.set("h", makeIr());
    expect(cache.has("h")).toBe(true);
  });

  it("delete removes entries", () => {
    const cache = new CompilerCache();
    cache.set("h", makeIr());
    expect(cache.delete("h")).toBe(true);
    expect(cache.has("h")).toBe(false);
  });

  it("clear removes all entries", () => {
    const cache = new CompilerCache();
    cache.set("a", makeIr());
    cache.set("b", makeIr());
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("evicts oldest entry when max size reached", () => {
    const cache = new CompilerCache(2);
    cache.set("a", makeIr());
    cache.set("b", makeIr());
    cache.set("c", makeIr());
    expect(cache.size).toBe(2);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("updates access time on get", () => {
    const cache = new CompilerCache(2);
    cache.set("a", makeIr());
    cache.set("b", makeIr());
    cache.get("a");
    cache.set("c", makeIr());
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("refreshes existing entries without evicting another entry", () => {
    const cache = new CompilerCache(2);
    const updated = makeIr();
    cache.set("a", makeIr());
    cache.set("b", makeIr());
    cache.set("a", updated);
    expect(cache.size).toBe(2);
    expect(cache.has("b")).toBe(true);
    cache.set("c", makeIr());
    expect(cache.get("a")).toBe(updated);
    expect(cache.has("b")).toBe(false);
  });

  it("evicts an empty-string key and stays within capacity", () => {
    const cache = new CompilerCache(1);
    cache.set("", makeIr());
    cache.set("next", makeIr());
    expect(cache.has("")).toBe(false);
    expect(cache.size).toBe(1);
  });

  it("stores no entries when capacity is zero", () => {
    const cache = new CompilerCache(0);
    cache.set("a", makeIr());
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid capacity %s",
    (capacity) => {
      expect(() => new CompilerCache(capacity)).toThrow(RangeError);
    },
  );
});
