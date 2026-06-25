import { describe, it, expect } from "vitest";
import { TemplateLoader } from "../src/loader/index";

describe("TemplateLoader", () => {
  it("adds and retrieves virtual sources", () => {
    const loader = new TemplateLoader();
    loader.addSource("hello.stn", "hello world");
    const src = loader.getSource("hello.stn");
    expect(src).toBeDefined();
    expect(src!.content).toBe("hello world");
    expect(src!.path).toBe("hello.stn");
    expect(src!.hash).toMatch(/^[0-9a-f]+$/);
  });

  it("returns undefined for unknown sources", () => {
    const loader = new TemplateLoader();
    expect(loader.getSource("missing.stn")).toBeUndefined();
  });

  it("hasSource works", () => {
    const loader = new TemplateLoader();
    expect(loader.hasSource("a.stn")).toBe(false);
    loader.addSource("a.stn", "content");
    expect(loader.hasSource("a.stn")).toBe(true);
  });

  it("listSources returns all sources", () => {
    const loader = new TemplateLoader();
    loader.addSource("a.stn", "aaa");
    loader.addSource("b.stn", "bbb");
    const list = loader.listSources();
    expect(list).toHaveLength(2);
    expect(list.map((s) => s.path).sort()).toEqual(["a.stn", "b.stn"]);
  });

  it("clear removes all sources", () => {
    const loader = new TemplateLoader();
    loader.addSource("a.stn", "content");
    loader.clear();
    expect(loader.listSources()).toHaveLength(0);
  });

  it("load retrieves cached source without fs", async () => {
    const loader = new TemplateLoader();
    loader.addSource("a.stn", "content");
    const src = await loader.load("a.stn");
    expect(src.content).toBe("content");
  });

  it("load throws without fs for unknown source", async () => {
    const loader = new TemplateLoader();
    await expect(loader.load("missing.stn")).rejects.toThrow("No file system provided");
  });

  it("load uses fs when available", async () => {
    const fakeFs = {
      readFile: async (path: string) => `file:${path}`,
    };
    const loader = new TemplateLoader(fakeFs);
    const src = await loader.load("remote.stn");
    expect(src.content).toBe("file:remote.stn");
    expect(loader.hasSource("remote.stn")).toBe(true);
  });
});
