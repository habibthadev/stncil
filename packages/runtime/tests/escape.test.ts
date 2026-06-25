import { describe, it, expect } from "vitest";
import { escapeHtml, escapeUrl, escapeCss } from "../src/escape/index";

describe("escapeHtml", () => {
  it("escapes ampersands", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  it("escapes angle brackets", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
    expect(escapeHtml("'hello'")).toBe("&#39;hello&#39;");
  });

  it("returns empty string for null/undefined", () => {
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
  });

  it("converts non-string values", () => {
    expect(escapeHtml(42)).toBe("42");
    expect(escapeHtml(true)).toBe("true");
  });

  it("passes through safe strings unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world");
  });
});

describe("escapeUrl", () => {
  it("percent-encodes special characters", () => {
    expect(escapeUrl("hello world")).toBe("hello+world");
  });

  it("encodes slashes", () => {
    expect(escapeUrl("a/b")).toBe("a%2Fb");
  });

  it("encodes ampersands", () => {
    expect(escapeUrl("a&b")).toBe("a%26b");
  });

  it("returns empty string for null/undefined", () => {
    expect(escapeUrl(null)).toBe("");
    expect(escapeUrl(undefined)).toBe("");
  });
});

describe("escapeCss", () => {
  it("passes through safe strings unchanged", () => {
    expect(escapeCss("hello")).toBe("hello");
  });

  it("escapes backslashes", () => {
    expect(escapeCss("a\\b")).toContain("\\");
  });

  it("returns empty string for null/undefined", () => {
    expect(escapeCss(null)).toBe("");
    expect(escapeCss(undefined)).toBe("");
  });
});
