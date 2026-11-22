import { describe, it, expect } from "vitest";
import { Lexer } from "../src/lexer/index";
import { Parser } from "../src/parser/index";
import type { RecursiveDefNode } from "../src/parser/ast";

function parse(src: string) {
  const lexer = new Lexer(src);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens);
  return parser.parse();
}

describe("Parser", () => {
  it("parses literal text", () => {
    const ast = parse("hello world");
    expect(ast.kind).toBe("template");
    expect(ast.nodes).toHaveLength(1);
    expect(ast.nodes[0]!.kind).toBe("literal");
    if (ast.nodes[0]!.kind === "literal") {
      expect(ast.nodes[0]!.value).toBe("hello world");
    }
  });

  it("parses {{ }} interpolation", () => {
    const ast = parse("{{ user.name }}");
    expect(ast.nodes).toHaveLength(1);
    expect(ast.nodes[0]!.kind).toBe("interp");
  });

  it("parses @if block", () => {
    const ast = parse("@if (x > 0) { hello } @else { world }");
    const ifNode = ast.nodes.find((n) => n.kind === "if");
    expect(ifNode).toBeDefined();
    if (ifNode?.kind === "if") {
      expect(ifNode.condition.kind).toBe("binary");
      expect(ifNode.consequent.length).toBeGreaterThan(0);
      expect(ifNode.alternate).not.toBeNull();
      expect(ifNode.alternate!.length).toBeGreaterThan(0);
    }
  });

  it("parses @each block with @empty", () => {
    const ast = parse("@each (item in items) { {{ item }} } @empty { empty }");
    const eachNode = ast.nodes.find((n) => n.kind === "each");
    expect(eachNode).toBeDefined();
    if (eachNode?.kind === "each") {
      expect(eachNode.itemName).toBe("item");
      expect(eachNode.source.kind).toBe("path");
      expect(eachNode.empty.length).toBeGreaterThan(0);
    }
  });

  it("parses @each with index", () => {
    const ast = parse("@each (item, index in items) { {{ item }} } @empty {}");
    const eachNode = ast.nodes.find((n) => n.kind === "each")!;
    if (eachNode?.kind === "each") {
      expect(eachNode.itemName).toBe("item");
      expect(eachNode.indexName).toBe("index");
    }
  });

  it("parses @context declaration", () => {
    const ast = parse("@context { name: string age: number }");
    const ctx = ast.nodes.find((n) => n.kind === "context_decl");
    expect(ctx).toBeDefined();
    if (ctx?.kind === "context_decl") {
      expect(ctx.fields).toHaveLength(2);
    }
  });

  it("parses comma-separated context arrays, records, and unions", () => {
    const ast = parse(
      "@context { posts: { title: string, author?: string }[], values: (number | null)[][], scores: Record<string, number>, }",
    );
    const context = ast.nodes.find((node) => node.kind === "context_decl");
    expect(context?.kind).toBe("context_decl");
    if (context?.kind !== "context_decl") return;
    expect(context.fields[0]?.typeExpr).toMatchObject({
      kind: "array",
      item: { kind: "object", fields: [{ name: "title" }, { name: "author", optional: true }] },
    });
    expect(context.fields[1]?.typeExpr).toEqual({
      kind: "array",
      item: {
        kind: "array",
        item: { kind: "union", variants: [{ kind: "number" }, { kind: "null" }] },
      },
    });
    expect(context.fields[2]?.typeExpr).toEqual({ kind: "record", value: { kind: "number" } });
  });

  it("rejects malformed and unsupported context types", () => {
    for (const type of [
      "number[2]",
      "Record<number, string>",
      "MissingType",
      '"ready" | "busy"',
      "number |",
    ])
      expect(() => parse(`@context { value: ${type} }`)).toThrow();
  });

  it("parses @let binding", () => {
    const ast = parse("@let x = 42");
    const letNode = ast.nodes.find((n) => n.kind === "let");
    expect(letNode).toBeDefined();
    if (letNode?.kind === "let") {
      expect(letNode.name).toBe("x");
      expect(letNode.value.kind).toBe("number");
    }
  });

  it("parses @async with @loading and @error", () => {
    const ast = parse("@async (data from fetch()) { body } @loading { load } @error (err) { err }");
    const asyncNode = ast.nodes.find((n) => n.kind === "async_block");
    expect(asyncNode).toBeDefined();
    if (asyncNode?.kind === "async_block") {
      expect(asyncNode.binding).toBe("data");
      expect(asyncNode.fetcher).toBe("fetch");
      expect(asyncNode.loading.length).toBeGreaterThan(0);
      expect(asyncNode.errorBinding).toBe("err");
      expect(asyncNode.error.length).toBeGreaterThan(0);
    }
  });

  it("parses @cache block", () => {
    const ast = parse('@cache(key: "mykey", ttl: 300) { cached }');
    const cacheNode = ast.nodes.find((n) => n.kind === "cache_block");
    expect(cacheNode).toBeDefined();
    if (cacheNode?.kind === "cache_block") {
      expect(cacheNode.ttl).toBe(300);
    }
  });

  it("parses @layout with slots", () => {
    const ast = parse('@layout "./base.stn" { @slot content { <h1>Hello</h1> } }');
    const layoutNode = ast.nodes.find((n) => n.kind === "layout");
    expect(layoutNode).toBeDefined();
    if (layoutNode?.kind === "layout") {
      expect(layoutNode.path).toBe("./base.stn");
      expect(layoutNode.slots).toHaveLength(1);
      expect(layoutNode.slots[0]!.name).toBe("content");
    }
  });

  it("parses @import and @render", () => {
    const ast = parse('@import { Avatar } from "./avatar.stn" @render Avatar({})');
    const importNode = ast.nodes.find((n) => n.kind === "import");
    const renderNode = ast.nodes.find((n) => n.kind === "render");
    expect(importNode).toBeDefined();
    expect(renderNode).toBeDefined();
  });

  it("parses @head block", () => {
    const ast = parse('@head { @title { Title } @meta(name: "description", content: desc) }');
    const headNode = ast.nodes.find((n) => n.kind === "head_push");
    expect(headNode).toBeDefined();
    if (headNode?.kind === "head_push") {
      expect(headNode.contributions.length).toBe(2);
    }
  });

  it("parses @style block", () => {
    const ast = parse("@style { .card { color: red; } }");
    const styleNode = ast.nodes.find((n) => n.kind === "style_block");
    expect(styleNode).toBeDefined();
    if (styleNode?.kind === "style_block") {
      expect(styleNode.css).toContain("card");
    }
  });

  it("parses @script block", () => {
    const ast = parse('@script(defer) { console.log("hi"); }');
    const scriptNode = ast.nodes.find((n) => n.kind === "script_block");
    expect(scriptNode).toBeDefined();
    if (scriptNode?.kind === "script_block") {
      expect(scriptNode.scriptType).toBe("inline"); // default since only defer attribute
    }
  });

  it("parses @csrf", () => {
    const ast = parse("@csrf");
    expect(ast.nodes[0]!.kind).toBe("csrf");
  });

  it("parses @asset", () => {
    const ast = parse('@asset("/css/app.css")');
    expect(ast.nodes[0]!.kind).toBe("asset");
  });

  it("parses @json", () => {
    const ast = parse("@json(user.id)");
    expect(ast.nodes[0]!.kind).toBe("json");
  });

  it("parses @nonce", () => {
    const ast = parse("@nonce");
    expect(ast.nodes[0]!.kind).toBe("nonce_ref");
  });

  it("parses @debug", () => {
    const ast = parse("@debug");
    expect(ast.nodes[0]!.kind).toBe("debug");
  });

  it("parses @t", () => {
    const ast = parse('@t("nav.home")');
    expect(ast.nodes[0]!.kind).toBe("translate");
  });

  it("parses @recursive and @recurse", () => {
    const ast = parse("@recursive TreeNode(node) { {{ node.label }} @recurse TreeNode(child) }");
    const defNode = ast.nodes.find((n) => n.kind === "recursive_def") as
      | RecursiveDefNode
      | undefined;
    expect(defNode).toBeDefined();
    const callNode = defNode!.body.find((n) => n.kind === "recursive_call");
    expect(callNode).toBeDefined();
  });

  it("parses @output mode", () => {
    const ast = parse("@output(text)");
    expect(ast.nodes[0]!.kind).toBe("output_mode");
  });

  it("parses @boundary with @fallback", () => {
    const ast = parse("@boundary { body } @fallback (err) { fallback }");
    const boundaryNode = ast.nodes.find((n) => n.kind === "boundary");
    expect(boundaryNode).toBeDefined();
    if (boundaryNode?.kind === "boundary") {
      expect(boundaryNode.errorBinding).toBe("err");
      expect(boundaryNode.fallback.length).toBeGreaterThan(0);
    }
  });

  it("parses @styles and @scripts targets", () => {
    const ast = parse("@styles @scripts");
    expect(ast.nodes[0]!.kind).toBe("styles_target");
    expect(ast.nodes[1]).toMatchObject({ kind: "literal", value: " " });
    expect(ast.nodes[2]!.kind).toBe("scripts_target");
  });

  it("parses @slot definitions", () => {
    const ast = parse("@slot content { default }");
    expect(ast.nodes[0]!.kind).toBe("slot_def");
    if (ast.nodes[0]!.kind === "slot_def") {
      expect(ast.nodes[0]!.name).toBe("content");
    }
  });

  it("parses @if- with trim markers", () => {
    const ast = parse("@if- (true) { body } -@if");
    const ifNode = ast.nodes.find((n) => n.kind === "if");
    expect(ifNode).toBeDefined();
  });

  it("parses ternary expressions", () => {
    const ast = parse('{{ x == 0 ? "first" : "" }}');
    const interp = ast.nodes[0];
    expect(interp?.kind).toBe("interp");
    if (interp?.kind === "interp") {
      expect(interp.expr.kind).toBe("ternary");
    }
  });

  it("parses filter chains", () => {
    const ast = parse("{{ user.name | upper | truncate(10) }}");
    const interp = ast.nodes[0];
    expect(interp?.kind).toBe("interp");
  });

  it("parses spread props in @render", () => {
    const ast = parse('@render Card({ ...props, title: "hi" })');
    const renderNode = ast.nodes.find((n) => n.kind === "render");
    expect(renderNode).toBeDefined();
  });
});
