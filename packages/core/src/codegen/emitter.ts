import { AstNode, ExprNode, OutputMode, FilterNode, CacheKeyPart } from "../parser/ast";
import {
  IrDocument,
  IrInstruction,
  IrExpr,
  IrFilter,
  IrBinaryOp,
  IrUnaryOp,
  IrCacheKeyPart,
  OutputMode as IrOutputMode,
  IrType,
  HeadContribution,
  WriteLiteralInstruction,
} from "./ir";
import { generateScopeHash } from "./scope-hash";
import { Span } from "../error";

let nodeIdCounter = 0;
function nextNodeId(): string {
  return `n${nodeIdCounter++}`;
}

export class Emitter {
  private instructions: IrInstruction[] = [];
  private sourceMap: Record<string, { line: number; col: number }> = {};
  private translationKeys = new Set<string>();
  private fetchers = new Set<string>();
  private outputMode: OutputMode = "html";
  private context: Record<string, IrType> = {};
  private sourceFile: string;
  private sourceHash: string;
  private scopeHash: string;
  private debugMode: boolean;
  private inScriptBlock = false;
  private imports = new Map<string, string>();

  constructor(
    sourceFile: string,
    sourceHash: string,
    outputMode: OutputMode,
    context: Record<string, IrType>,
    debug: boolean,
  ) {
    this.sourceFile = sourceFile;
    this.sourceHash = sourceHash;
    this.outputMode = outputMode;
    this.context = context;
    this.debugMode = debug;
    this.scopeHash = "";
  }

  async emit(nodes: AstNode[]): Promise<IrDocument> {
    this.scopeHash = await generateScopeHash(this.sourceFile);
    this.emitNodes(nodes);
    const merged = this.mergeLiterals(this.instructions);
    return {
      stncilVersion: 1,
      outputMode: this.outputMode as IrOutputMode,
      sourceFile: this.sourceFile,
      sourceHash: this.sourceHash,
      compiledAt: new Date().toISOString(),
      scopeHash: this.scopeHash,
      context: this.context,
      translationsManifest: Array.from(this.translationKeys),
      fetchersManifest: Array.from(this.fetchers).map((name) => ({
        name,
        argTypes: [],
      })),
      sourceMap: { nodes: this.sourceMap },
      instructions: merged,
    };
  }

  private emitNodes(nodes: readonly AstNode[]): void {
    for (const node of nodes) {
      this.emitNode(node);
    }
  }

  private emitNode(node: AstNode): void {
    switch (node.kind) {
      case "literal":
        this.emitLiteral(node.value, node.span);
        break;
      case "interp":
        this.emitInterp(node);
        break;
      case "if":
        this.emitIf(node);
        break;
      case "each":
        this.emitEach(node);
        break;
      case "async_block":
        this.emitAsyncBlock(node);
        break;
      case "let":
        this.emitLet(node);
        break;
      case "cache_block":
        this.emitCacheBlock(node);
        break;
      case "boundary":
        this.emitBoundary(node);
        break;
      case "layout":
        this.emitLayout(node);
        break;
      case "slot_def":
        this.emitSlotDef(node);
        break;
      case "import":
        for (const name of node.names) this.imports.set(name, node.path);
        break;
      case "render":
        this.emitRender(node);
        break;
      case "recursive_def":
        this.emitRecursiveDef(node);
        break;
      case "recursive_call":
        this.emitRecursiveCall(node);
        break;
      case "head_push":
        this.emitHeadPush(node);
        break;
      case "style_block":
        this.emitStyleBlock(node);
        break;
      case "styles_target":
        this.instructions.push({ op: "STYLES_TARGET", nodeId: nextNodeId() });
        break;
      case "script_block":
        this.emitScriptBlock(node);
        break;
      case "scripts_target":
        this.instructions.push({ op: "SCRIPTS_TARGET", nodeId: nextNodeId() });
        break;
      case "csrf":
        this.instructions.push({ op: "CSRF", nodeId: nextNodeId() });
        break;
      case "asset":
        this.instructions.push({ op: "WRITE_ASSET", path: node.path, nodeId: nextNodeId() });
        break;
      case "json":
        {
          const jPath = this.exprToPath(node.expr);
          if (jPath)
            this.instructions.push({ op: "WRITE_JSON", path: jPath, nodeId: nextNodeId() });
        }
        break;
      case "nonce_ref":
        this.instructions.push({ op: "WRITE_NONCE", nodeId: nextNodeId() });
        break;
      case "debug":
        if (this.debugMode) {
          this.instructions.push({ op: "DEBUG", path: node.path ?? null, nodeId: nextNodeId() });
        }
        break;
      case "translate":
        this.translationKeys.add(node.key);
        this.emitTranslate(node);
        break;
      case "filter_chain":
        this.emitFilterChain(node);
        break;
      case "output_mode":
        break;
      case "context_decl":
        break;
      case "head_title":
      case "head_meta":
      case "head_canonical":
      case "head_jsonld":
        break;
    }
  }

  private emitLiteral(value: string, span: Span): void {
    if (value.length === 0) return;
    if (this.outputMode === "text") {
      value = value.replace(/<[^>]*>/g, "");
    }
    this.addSourceMap(nextNodeId(), span);
    this.instructions.push({ op: "WRITE_LITERAL", value, nodeId: nextNodeId() });
  }

  private emitInterp(node: {
    expr: ExprNode;
    escapeContext?: string;
    trimStart: boolean;
    trimEnd: boolean;
    raw?: boolean;
    span: Span;
  }): void {
    if (this.inScriptBlock) return;
    if (node.expr.kind === "filter_chain" && node.expr.expr.kind === "path" && !node.raw) {
      this.emitFilterChain(node.expr);
      return;
    }
    const path = this.exprToPath(node.expr);
    if (!path) {
      this.instructions.push({
        op: "WRITE_EXPRESSION",
        expr: this.exprToIrExpr(node.expr),
        escape: node.raw ? "raw" : "html",
        nodeId: nextNodeId(),
      });
      return;
    }
    if (node.raw) {
      this.instructions.push({ op: "WRITE_TRUSTED", path, nodeId: nextNodeId() });
      return;
    }
    const ec = node.escapeContext;
    if (ec === "url" || ec === "href") {
      this.instructions.push({ op: "WRITE_URL_ESCAPED", path, nodeId: nextNodeId() });
    } else if (ec === "css") {
      this.instructions.push({ op: "WRITE_CSS_ESCAPED", path, nodeId: nextNodeId() });
    } else if (this.outputMode === "xml") {
      this.instructions.push({ op: "WRITE_ESCAPED", path, nodeId: nextNodeId() });
    } else {
      this.instructions.push({ op: "WRITE_ESCAPED", path, nodeId: nextNodeId() });
    }
  }

  private emitIf(node: {
    condition: ExprNode;
    consequent: AstNode[];
    elseIfs: { condition: ExprNode; body: AstNode[] }[];
    alternate: AstNode[] | null;
    span: Span;
  }): void {
    const saved = this.instructions;
    this.instructions = [];
    this.emitNodes(node.consequent);
    const consequent = [...this.instructions];

    const elseIfs = node.elseIfs.map((ei) => {
      this.instructions = [];
      this.emitNodes(ei.body);
      return { condition: this.exprToIrExpr(ei.condition), body: [...this.instructions] };
    });

    let alternate: IrInstruction[] | null = null;
    if (node.alternate) {
      this.instructions = [];
      this.emitNodes(node.alternate);
      alternate = [...this.instructions];
    }

    this.instructions = saved;
    this.instructions.push({
      op: "IF",
      condition: this.exprToIrExpr(node.condition),
      consequent,
      elseIfs,
      alternate,
      nodeId: nextNodeId(),
    });
  }

  private emitEach(node: {
    itemName: string;
    indexName: string | null;
    source: ExprNode;
    body: AstNode[];
    empty: AstNode[];
    span: Span;
  }): void {
    const saved = this.instructions;
    this.instructions = [];
    this.emitNodes(node.body);
    const body = [...this.instructions];

    this.instructions = [];
    this.emitNodes(node.empty);
    const empty = [...this.instructions];

    this.instructions = saved;
    this.instructions.push({
      op: "EACH",
      source: this.exprToIrExpr(node.source),
      as: node.itemName,
      indexAs: node.indexName,
      body,
      empty,
      nodeId: nextNodeId(),
    });
  }

  private emitAsyncBlock(node: {
    binding: string;
    fetcher: string;
    args: ExprNode[];
    body: AstNode[];
    loading: AstNode[];
    error: AstNode[];
    errorBinding: string | null;
    span: Span;
  }): void {
    this.fetchers.add(node.fetcher);
    const saved = this.instructions;

    this.instructions = [];
    this.emitNodes(node.body);
    const body = [...this.instructions];

    this.instructions = [];
    this.emitNodes(node.loading);
    const loading = [...this.instructions];

    this.instructions = [];
    this.emitNodes(node.error);
    const error = [...this.instructions];

    this.instructions = saved;
    this.instructions.push({
      op: "ASYNC_BLOCK",
      parallelGroup: null,
      binding: node.binding,
      fetcher: node.fetcher,
      args: node.args.map((a) => this.exprToIrExpr(a)),
      body,
      loading,
      errorBinding: node.errorBinding,
      error,
      nodeId: nextNodeId(),
    });
  }

  private emitLet(node: { name: string; value: ExprNode; span: Span }): void {
    this.instructions.push({
      op: "LET",
      name: node.name,
      value: this.exprToIrExpr(node.value),
      nodeId: nextNodeId(),
    });
  }

  private emitCacheBlock(node: {
    keyParts: CacheKeyPart[];
    ttl: number;
    body: AstNode[];
    span: Span;
  }): void {
    const saved = this.instructions;
    this.instructions = [];
    this.emitNodes(node.body);
    const body = [...this.instructions];

    this.instructions = saved;
    this.instructions.push({
      op: "CACHE_BLOCK",
      keyParts: node.keyParts.map(
        (kp): IrCacheKeyPart =>
          kp.kind === "literal"
            ? { kind: "literal", value: kp.value }
            : { kind: "expr", expr: this.exprToIrExpr(kp.expr) },
      ),
      ttl: node.ttl,
      body,
      nodeId: nextNodeId(),
    });
  }

  private emitBoundary(node: {
    body: AstNode[];
    errorBinding: string | null;
    fallback: AstNode[];
    span: Span;
  }): void {
    const saved = this.instructions;
    this.instructions = [];
    this.emitNodes(node.body);
    const body = [...this.instructions];

    this.instructions = [];
    this.emitNodes(node.fallback);
    const fallback = [...this.instructions];

    this.instructions = saved;
    this.instructions.push({
      op: "BOUNDARY",
      body,
      errorBinding: node.errorBinding,
      fallback,
      nodeId: nextNodeId(),
    });
  }

  private emitLayout(node: {
    path: string;
    slots: { name: string; body: AstNode[] }[];
    span: Span;
  }): void {
    this.instructions.push({
      op: "LAYOUT",
      template: node.path,
      slots: Object.fromEntries(
        node.slots.map((slot) => [slot.name, this.emitInstructionsForNodes(slot.body)]),
      ),
      nodeId: nextNodeId(),
    });
  }

  private emitSlotDef(node: { name: string; defaultBody: AstNode[] | null; span: Span }): void {
    let defaultBody: IrInstruction[] | null = null;
    if (node.defaultBody) {
      const saved = this.instructions;
      this.instructions = [];
      this.emitNodes(node.defaultBody);
      defaultBody = [...this.instructions];
      this.instructions = saved;
    }
    this.instructions.push({
      op: "SLOT_TARGET",
      name: node.name,
      defaultBody,
      nodeId: nextNodeId(),
    });
  }

  private emitRender(node: {
    name: string;
    props: { kind: string; name: string; value?: ExprNode; span?: Span }[];
  }): void {
    const props: Record<string, IrExpr> = Object.create(null);
    const spreads: IrExpr[] = [];
    for (const prop of node.props) {
      if (prop.kind === "named" && prop.value) {
        props[prop.name] = this.exprToIrExpr(prop.value);
      } else if (prop.kind === "spread") {
        spreads.push({ kind: "path", segments: [prop.name] });
      }
    }
    this.instructions.push({
      op: "RENDER_PARTIAL",
      template: this.imports.get(node.name) ?? node.name,
      props,
      spreads,
      nodeId: nextNodeId(),
    });
  }

  private emitRecursiveDef(node: {
    name: string;
    param: string;
    body: AstNode[];
    span: Span;
  }): void {
    const saved = this.instructions;
    this.instructions = [];
    this.emitNodes(node.body);
    const body = [...this.instructions];
    this.instructions = saved;
    this.instructions.push({
      op: "RECURSIVE_DEF",
      name: node.name,
      param: node.param,
      body,
      maxDepth: 50,
      nodeId: nextNodeId(),
    });
  }

  private emitRecursiveCall(node: { name: string; arg: ExprNode }): void {
    this.instructions.push({
      op: "RECURSIVE_CALL",
      name: node.name,
      arg: this.exprToIrExpr(node.arg),
      nodeId: nextNodeId(),
    });
  }

  private emitHeadPush(node: { contributions: any[]; span: Span }): void {
    const contributions: HeadContribution[] = [];
    for (const c of node.contributions) {
      if (c.kind === "head_title") {
        contributions.push({
          kind: "title",
          instructions: this.emitInstructionsForNodes(c.content),
        });
      } else if (c.kind === "head_meta") {
        const attrs: Record<string, IrExpr> = {};
        for (const [k, v] of Object.entries(c.attributes)) {
          attrs[k] = this.exprToIrExpr(v as ExprNode);
        }
        contributions.push({ kind: "meta", attributes: attrs });
      } else if (c.kind === "head_canonical") {
        contributions.push({ kind: "canonical", url: this.exprToIrExpr(c.url) });
      } else if (c.kind === "head_jsonld") {
        contributions.push({
          kind: "jsonld",
          instructions: this.emitInstructionsForNodes(c.content),
        });
      }
    }
    this.instructions.push({
      op: "HEAD_PUSH",
      contributions,
      nodeId: nextNodeId(),
    });
  }

  private emitStyleBlock(node: { css: string; critical: boolean; span: Span }): void {
    this.instructions.push({
      op: "STYLE_BLOCK",
      scopeHash: this.scopeHash,
      css: node.css,
      critical: node.critical,
      nodeId: nextNodeId(),
    });
  }

  private emitScriptBlock(node: {
    scriptType: string;
    content: AstNode[];
    attrType: string | null;
    span: Span;
  }): void {
    this.inScriptBlock = true;
    const saved = this.instructions;
    this.instructions = [];
    this.emitNodes(node.content);
    const content = [...this.instructions];
    this.instructions = saved;
    this.inScriptBlock = false;

    let scriptTypeVal: "defer" | "async" | "module" | "inline" = "inline";
    if (node.attrType === "module") scriptTypeVal = "module";
    else if (node.scriptType === "defer") scriptTypeVal = "defer";
    else if (node.scriptType === "async") scriptTypeVal = "async";

    const contentStr = content.map((i) => (i as any).value ?? "").join("");
    const contentHash = this.simpleHash(contentStr);

    this.instructions.push({
      op: "SCRIPT_BLOCK",
      content,
      scriptType: scriptTypeVal,
      contentHash,
      nodeId: nextNodeId(),
    });
  }

  private emitTranslate(node: { key: string; args: Record<string, ExprNode> }): void {
    const args: Record<string, IrExpr> = {};
    for (const [k, v] of Object.entries(node.args)) {
      args[k] = this.exprToIrExpr(v);
    }
    this.instructions.push({
      op: "TRANSLATE",
      key: node.key,
      args,
      nodeId: nextNodeId(),
    });
  }

  private emitFilterChain(node: { expr: ExprNode; filters: FilterNode[] }): void {
    const path = this.exprToPath(node.expr);
    if (!path) return;
    const filters: IrFilter[] = node.filters.map((f: FilterNode) => ({
      name: f.name,
      args: f.args.map((a: ExprNode) => this.exprToIrExpr(a)),
    }));
    this.instructions.push({
      op: "WRITE_FILTER",
      path,
      filters,
      nodeId: nextNodeId(),
    });
  }

  private emitInstructionsForNodes(nodes: AstNode[]): IrInstruction[] {
    const saved = this.instructions;
    this.instructions = [];
    this.emitNodes(nodes);
    const result = [...this.instructions];
    this.instructions = saved;
    return result;
  }

  private expToPath(expr: ExprNode): string[] | null {
    return this.exprToPath(expr);
  }

  private exprToPath(expr: ExprNode): string[] | null {
    if (expr.kind === "path") return [...expr.segments];
    return null;
  }

  private exprToIrExpr(expr: ExprNode): IrExpr {
    switch (expr.kind) {
      case "path":
        return { kind: "path", segments: [...expr.segments] };
      case "string":
        return { kind: "string", value: expr.value };
      case "number":
        return { kind: "number", value: expr.value };
      case "boolean":
        return { kind: "boolean", value: expr.value };
      case "null":
        return { kind: "null" };
      case "binary":
        return {
          kind: "binary",
          op: expr.op as IrBinaryOp,
          left: this.exprToIrExpr(expr.left),
          right: this.exprToIrExpr(expr.right),
        };
      case "unary":
        return { kind: "unary", op: expr.op, operand: this.exprToIrExpr(expr.operand) };
      case "ternary":
        return {
          kind: "ternary",
          condition: this.exprToIrExpr(expr.condition),
          consequent: this.exprToIrExpr(expr.consequent),
          alternate: this.exprToIrExpr(expr.alternate),
        };
      case "filter_chain":
        return {
          kind: "filter_chain",
          expr: this.exprToIrExpr(expr.expr),
          filters: expr.filters.map((f) => ({
            name: f.name,
            args: f.args.map((a) => this.exprToIrExpr(a)),
          })),
        };
      case "array":
        return { kind: "array", items: expr.items.map((item) => this.exprToIrExpr(item)) };
      case "object":
        return {
          kind: "object",
          fields: expr.fields.map((field) => ({
            name: field.name,
            value: this.exprToIrExpr(field.value),
          })),
        };
      case "index":
        return {
          kind: "index",
          object: this.exprToIrExpr(expr.object),
          key: this.exprToIrExpr(expr.key),
        };
    }
  }

  private mergeLiterals(instructions: IrInstruction[]): IrInstruction[] {
    const merged: IrInstruction[] = [];
    for (const inst of instructions) {
      const last = merged[merged.length - 1];
      if (inst.op === "WRITE_LITERAL" && last && last.op === "WRITE_LITERAL") {
        const lastLit = last as WriteLiteralInstruction;
        merged[merged.length - 1] = {
          ...lastLit,
          value: lastLit.value + (inst as WriteLiteralInstruction).value,
        };
      } else {
        merged.push(inst);
      }
    }
    return merged;
  }

  private addSourceMap(nodeId: string, span: Span): void {
    this.sourceMap[nodeId] = { line: span.line, col: span.col };
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }
}
