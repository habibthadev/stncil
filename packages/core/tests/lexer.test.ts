import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/index";

function tokenize(src: string) {
  const lexer = new Lexer(src);
  return lexer.tokenize().filter((t) => t.type !== "EOF");
}

describe("Lexer", () => {
  it("tokenizes literal text", () => {
    const tokens = tokenize("hello world");
    expect(tokens).toHaveLength(3);
    expect(tokens[0]!.type).toBe("IDENTIFIER");
    expect(tokens[0]!.value).toBe("hello");
    expect(tokens[1]!.type).toBe("LITERAL");
    expect(tokens[1]!.value).toBe(" ");
    expect(tokens[2]!.type).toBe("IDENTIFIER");
    expect(tokens[2]!.value).toBe("world");
  });

  it("tokenizes {{ interpolation", () => {
    const tokens = tokenize("{{ user.name }}");
    expect(tokens[0]!.type).toBe("INTERP_OPEN");
    expect(tokens[tokens.length - 1]!.type).toBe("INTERP_CLOSE");
  });

  it("tokenizes {{- trim open", () => {
    const tokens = tokenize("{{- name }}");
    expect(tokens[0]!.type).toBe("INTERP_OPEN_TRIM");
  });

  it("tokenizes -}} trim close", () => {
    const tokens = tokenize("{{ name -}}");
    expect(tokens[tokens.length - 1]!.type).toBe("INTERP_CLOSE_TRIM");
  });

  it("tokenizes @if and @else", () => {
    const tokens = tokenize("@if (true) {} @else {}");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("IF");
    expect(types).toContain("ELSE");
    expect(types).toContain("LPAREN");
    expect(types).toContain("RPAREN");
    expect(types).toContain("LBRACE");
    expect(types).toContain("RBRACE");
  });

  it("tokenizes @each", () => {
    const tokens = tokenize("@each (item in items) {} @empty {}");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("EACH");
    expect(types).toContain("EMPTY");
  });

  it("tokenizes @async", () => {
    const tokens = tokenize('@async (data from fetchData(id)) {} @loading {} @error (err) {}');
    const types = tokens.map((t) => t.type);
    expect(types).toContain("ASYNC");
    expect(types).toContain("LOADING");
    expect(types).toContain("ERROR");
  });

  it("tokenizes @context", () => {
    const tokens = tokenize("@context { name: string }");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("CONTEXT");
    expect(types).toContain("LBRACE");
    expect(types).toContain("RBRACE");
  });

  it("tokenizes @* comment *@", () => {
    const tokens = tokenize("before @* comment *@ after");
    expect(tokens).toHaveLength(4);
    expect(tokens[0]!.type).toBe("IDENTIFIER");
    expect(tokens[0]!.value).toBe("before");
    expect(tokens[1]!.type).toBe("LITERAL");
    expect(tokens[1]!.value).toBe(" ");
    expect(tokens[2]!.type).toBe("LITERAL");
    expect(tokens[2]!.value).toBe(" ");
    expect(tokens[3]!.type).toBe("IDENTIFIER");
    expect(tokens[3]!.value).toBe("after");
  });

  it("tokenizes @let", () => {
    const tokens = tokenize("@let x = 1");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("LET");
    expect(types).toContain("EQUALS");
  });

  it("tokenizes @head block", () => {
    const tokens = tokenize("@head { @title { Hello } @meta(name: \"desc\", content: x) }");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("HEAD");
    expect(types).toContain("TITLE");
    expect(types).toContain("META");
  });

  it("tokenizes @style and @script", () => {
    const tokens = tokenize("@style { .a {} } @script(defer) { code }");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("STYLE");
    expect(types).toContain("SCRIPT");
  });

  it("tokenizes @csrf", () => {
    const tokens = tokenize("@csrf");
    expect(tokens[0]!.type).toBe("CSRF");
  });

  it("tokenizes @asset", () => {
    const tokens = tokenize('@asset("/css/app.css")');
    expect(tokens[0]!.type).toBe("ASSET");
  });

  it("tokenizes @json", () => {
    const tokens = tokenize("@json(x)");
    expect(tokens[0]!.type).toBe("JSON");
  });

  it("tokenizes @debug", () => {
    const tokens = tokenize("@debug");
    expect(tokens[0]!.type).toBe("DEBUG");
  });

  it("tokenizes @t", () => {
    const tokens = tokenize('@t("key")');
    expect(tokens[0]!.type).toBe("T");
  });

  it("tokenizes @recursive and @recurse", () => {
    const tokens = tokenize("@recursive Foo(x) {} @recurse Foo(x)");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("RECURSIVE");
    expect(types).toContain("RECURSE");
  });

  it("tokenizes @output", () => {
    const tokens = tokenize("@output(html)");
    expect(tokens[0]!.type).toBe("OUTPUT");
  });

  it("tokenizes @cache", () => {
    const tokens = tokenize('@cache(key: "k", ttl: 300) {}');
    expect(tokens[0]!.type).toBe("CACHE");
  });

  it("tokenizes @layout", () => {
    const tokens = tokenize('@layout "./base.stn" {}');
    expect(tokens[0]!.type).toBe("LAYOUT");
  });

  it("tokenizes @nonce", () => {
    const tokens = tokenize("@nonce");
    expect(tokens[0]!.type).toBe("NONCE");
  });

  it("tokenizes @import", () => {
    const tokens = tokenize('@import { Avatar } from "./avatar.stn"');
    expect(tokens[0]!.type).toBe("IMPORT");
  });

  it("tokenizes @render", () => {
    const tokens = tokenize("@render Avatar({})");
    expect(tokens[0]!.type).toBe("RENDER");
  });

  it("tokenizes @boundary and @fallback", () => {
    const tokens = tokenize("@boundary {} @fallback (err) {}");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("BOUNDARY");
    expect(types).toContain("FALLBACK");
  });

  it("tokenizes @slot", () => {
    const tokens = tokenize("@slot content {}");
    expect(tokens[0]!.type).toBe("SLOT");
  });

  it("tokenizes @styles and @scripts", () => {
    const tokens = tokenize("@styles @scripts");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("STYLES");
    expect(types).toContain("SCRIPTS");
  });

  it("throws on unknown sigil", () => {
    expect(() => tokenize("@unknown")).toThrow();
  });

  it("handles unclosed {{ at EOF", () => {
    const tokens = tokenize("{{ unclosed");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("INTERP_OPEN");
    expect(types).toContain("IDENTIFIER");
  });

  it("tokenizes identifiers, strings, numbers, booleans, null, dots, pipes", () => {
    const tokens = tokenize("@if (x > 0 && y != null || true) { @let name = \"test\" }");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("IF");
    expect(types).toContain("AND");
    expect(types).toContain("OR");
    expect(types).toContain("NEQ");
    expect(types).toContain("GT");
    expect(types).toContain("LET");
    expect(types).toContain("STRING");
  });

  it("tokenizes -@if trim", () => {
    const tokens = tokenize("@if- (true) {} -@if");
    const types = tokens.map((t) => t.type);
    expect(types).toContain("TRIM_IF");
    expect(types).toContain("TRIM_CLOSE_IF");
  });
});
