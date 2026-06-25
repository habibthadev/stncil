import { AstNode, ExprNode, TypeExprNode, ContextFieldNode, OutputMode, BinaryExprNode } from "../parser/ast";
import { Span, TypeCheckError } from "../error";
import { IrType } from "./types";
import { Scope } from "./scope";
import { narrowType } from "./narrowing";
import { ERROR_CODES, ErrorCode } from "./error";

export interface TypeCheckResult {
  readonly typedAst: AstNode[];
  readonly errors: TypeCheckError[];
  readonly warnings: TypeCheckError[];
  readonly context: Record<string, IrType>;
  readonly outputMode: OutputMode;
  readonly translationKeys: Set<string>;
}

export class TypeChecker {
  private scope = new Scope();
  private errors: TypeCheckError[] = [];
  private warnings: TypeCheckError[] = [];
  private context: Record<string, IrType> = {};
  private outputMode: OutputMode = "html";
  private translationKeys = new Set<string>();
  private inScriptBlock = false;
  private inHeadBlock = false;
  private boundaryDepth = 0;
  private isLayout = false;
  private sourceFile: string;

  constructor(
    sourceFile: string,
    private readonly strict: boolean,
    private readonly debug: boolean,
    private readonly assetManifest?: Record<string, string>,
  ) {
    this.sourceFile = sourceFile;
  }

  check(ast: AstNode[]): TypeCheckResult {
    this.processNodes(ast);
    return {
      typedAst: ast,
      errors: this.errors,
      warnings: this.warnings,
      context: this.context,
      outputMode: this.outputMode,
      translationKeys: this.translationKeys,
    };
  }

  private processNodes(nodes: AstNode[], parentContext?: { inHead?: boolean; inScript?: boolean }): void {
    for (const node of nodes) {
      this.processNode(node, parentContext);
    }
  }

  private processNode(node: AstNode, parentContext?: { inHead?: boolean; inScript?: boolean }): void {
    switch (node.kind) {
      case "output_mode":
        this.outputMode = node.mode;
        break;
      case "context_decl":
        this.processContextDecl(node);
        break;
      case "literal":
        break;
      case "interp":
        this.processInterp(node, parentContext);
        break;
      case "if":
        this.processIf(node);
        break;
      case "each":
        this.processEach(node);
        break;
      case "async_block":
        this.processAsyncBlock(node);
        break;
      case "let":
        this.processLet(node);
        break;
      case "cache_block":
        this.processNodes(node.body, parentContext);
        break;
      case "boundary":
        this.processBoundary(node);
        break;
      case "layout":
        this.processLayout(node);
        break;
      case "slot_def":
        break;
      case "import":
        break;
      case "render":
        break;
      case "recursive_def":
        this.processNodes(node.body, parentContext);
        break;
      case "recursive_call":
        break;
      case "head_push":
        this.processHeadPush(node);
        break;
      case "style_block":
        this.processStyleBlock(node);
        break;
      case "styles_target":
        this.processStylesTarget();
        break;
      case "script_block":
        this.processScriptBlock(node);
        break;
      case "scripts_target":
        this.processScriptsTarget();
        break;
      case "csrf":
        this.processCsrf();
        break;
      case "asset":
        break;
      case "json":
        break;
      case "nonce_ref":
        break;
      case "debug":
        this.processDebug(node);
        break;
      case "translate":
        this.translationKeys.add(node.key);
        break;
      case "filter_chain":
        break;
    }
  }

  private processContextDecl(node: { fields: ContextFieldNode[] }): void {
    for (const field of node.fields) {
      const irType = this.typeExprToIrType(field.typeExpr);
      this.context[field.name] = field.optional ? { kind: "optional", inner: irType } : irType;
      this.scope.declare(field.name, this.context[field.name]!, "context");
    }
  }

  private processInterp(node: { expr: ExprNode; escapeContext?: string; trimStart: boolean; trimEnd: boolean; span: Span }, parentContext?: { inHead?: boolean; inScript?: boolean }): void {
    if (parentContext?.inScript && !this.inScriptBlock) {
      return;
    }
    if (this.inScriptBlock) {
      this.addError("E015", "Raw {{ }} used inside @script block without | js or @json()", node.span);
      return;
    }
    this.validateExprType(node.expr, node.span);
    if (node.escapeContext === "url" || node.escapeContext === "href") {
      this.validateUrlContext(node.expr, node.span);
    }
    if (node.escapeContext === "css") {
      this.validateCssContext(node.expr, node.span);
    }
  }

  private processIf(node: { condition: ExprNode; consequent: AstNode[]; elseIfs: { condition: ExprNode; body: AstNode[] }[]; alternate: AstNode[] | null; trimStart: boolean; trimEnd: boolean; span: Span }): void {
    this.validateExprType(node.condition, node.span);

    const consequentScope = narrowType(node.condition, this.scope, true);
    const savedScope = this.scope;
    this.scope = consequentScope;
    this.processNodes(node.consequent);
    this.scope = savedScope;

    for (const ei of node.elseIfs) {
      this.validateExprType(ei.condition, node.span);
      const eiScope = narrowType(ei.condition, this.scope, true);
      const savedScope2 = this.scope;
      this.scope = eiScope;
      this.processNodes(ei.body);
      this.scope = savedScope2;
    }

    if (node.alternate) {
      const altScope = narrowType(node.condition, this.scope, false);
      const savedScope3 = this.scope;
      this.scope = altScope;
      this.processNodes(node.alternate);
      this.scope = savedScope3;
    }
  }

  private processEach(node: { itemName: string; indexName: string | null; source: ExprNode; body: AstNode[]; empty: AstNode[]; span: Span }): void {
    const sourceType = this.inferExprType(node.source);
    if (sourceType && sourceType.kind !== "array") {
      this.addError("E004", "Cannot iterate over non-array", node.span);
    }
    this.scope.pushFrame();
    this.scope.declare(node.itemName, { kind: "string" }, "each");
    if (node.indexName) {
      this.scope.declare(node.indexName, { kind: "number" }, "each");
    }
    this.processNodes(node.body);
    this.scope.popFrame();
  }

  private processAsyncBlock(node: { binding: string; fetcher: string; args: ExprNode[]; body: AstNode[]; loading: AstNode[]; error: AstNode[]; errorBinding: string | null; span: Span }): void {
    if (this.inHeadBlock) {
      this.addError("E019", "@async block used inside @head block", node.span);
    }
    this.scope.pushFrame();
    this.scope.declare(node.binding, { kind: "string" }, "async");
    this.processNodes(node.body);
    this.scope.popFrame();

    this.processNodes(node.loading);
    if (node.errorBinding) {
      this.scope.pushFrame();
      this.scope.declare(node.errorBinding, { kind: "object", fields: { message: { kind: "string" } } }, "error");
      this.processNodes(node.error);
      this.scope.popFrame();
    } else {
      this.processNodes(node.error);
    }
  }

  private processLet(node: { name: string; value: ExprNode; span: Span }): void {
    if (this.scope.has(node.name)) {
      this.addError("E007", `Duplicate variable declaration: ${node.name}`, node.span);
      return;
    }
    const type = this.inferExprType(node.value);
    this.scope.declare(node.name, type ?? { kind: "string" }, "let");
  }

  private processBoundary(node: { body: AstNode[]; errorBinding: string | null; fallback: AstNode[]; span: Span }): void {
    if (this.boundaryDepth > 0) {
      this.addError("E020", "@boundary nested inside @boundary", node.span);
      return;
    }
    this.boundaryDepth++;
    this.processNodes(node.body);
    this.boundaryDepth--;

    if (node.errorBinding) {
      this.scope.pushFrame();
      this.scope.declare(node.errorBinding, { kind: "object", fields: { message: { kind: "string" } } }, "error");
      this.processNodes(node.fallback);
      this.scope.popFrame();
    } else {
      this.processNodes(node.fallback);
    }
  }

  private processLayout(node: { path: string; slots: { name: string; body: AstNode[] }[]; span: Span }): void {
    this.isLayout = true;
    for (const slot of node.slots) {
      this.processNodes(slot.body);
    }
  }

  private processHeadPush(node: { contributions: any[]; span: Span }): void {
    if (this.outputMode !== "html") {
      this.addError("E022", "@head only works in HTML output mode", node.span);
    }
    const saved = this.inHeadBlock;
    this.inHeadBlock = true;
    for (const contrib of node.contributions) {
      if (contrib.kind === "head_title") {
        this.processNodes(contrib.content);
      } else if (contrib.kind === "head_jsonld") {
        this.processNodes(contrib.content);
      }
    }
    this.inHeadBlock = saved;
  }

  private processStyleBlock(node: { css: string; critical: boolean; span: Span }): void {
    if (this.outputMode === "text" || this.outputMode === "xml") {
      this.addError("E022", "@style used in text or XML output mode", node.span);
    }
  }

  private processStylesTarget(): void {
    if (!this.isLayout) {
      this.addError("E021", "@styles target used outside a layout template", { start: 0, end: 0, line: 0, col: 0 });
    }
  }

  private processScriptBlock(node: { scriptType: string; content: AstNode[]; attrType: string | null; span: Span }): void {
    if (this.outputMode === "text" || this.outputMode === "xml") {
      this.addError("E022", "@script used in text or XML output mode", node.span);
    }
    const saved = this.inScriptBlock;
    this.inScriptBlock = true;
    for (const child of node.content) {
      if (child.kind === "interp") {
        this.addError("E015", `Raw {{ }} used inside @script block without | js or @json()`, child.span);
      }
    }
    this.inScriptBlock = saved;
  }

  private processScriptsTarget(): void {
    if (!this.isLayout) {
      this.addError("E021", "@scripts target used outside a layout template", { start: 0, end: 0, line: 0, col: 0 });
    }
  }

  private processCsrf(): void {
    if (this.outputMode === "text" || this.outputMode === "xml") {
      this.addError("E023", "@csrf used in text or XML output mode", { start: 0, end: 0, line: 0, col: 0 });
    }
  }

  private processDebug(node: { path: string[] | null; span: Span }): void {
    if (this.outputMode === "text" || this.outputMode === "xml") {
      this.addError("E024", "@debug used in text or XML output mode", node.span);
    }
    if (!this.debug) {
      // Strip debug in production
    }
  }

  private validateUrlContext(expr: ExprNode, span: Span): void {
    if (expr.kind === "binary" || expr.kind === "unary" || expr.kind === "ternary") return;
    if (expr.kind === "path") {
      // Check that the expression uses | url filter
      // This is done during codegen
    }
  }

  private validateCssContext(expr: ExprNode, span: Span): void {
    // Check that the expression uses | cssValue filter
  }

  private validateExprType(expr: ExprNode, span: Span): IrType | null {
    return this.inferExprType(expr, span);
  }

  private inferExprType(expr: ExprNode, errorSpan?: Span): IrType | null {
    switch (expr.kind) {
      case "path":
        return this.resolvePath(expr.segments, errorSpan);
      case "string":
        return { kind: "string" };
      case "number":
        return { kind: "number" };
      case "boolean":
        return { kind: "boolean" };
      case "null":
        return { kind: "null" };
      case "binary":
        return this.inferBinaryType(expr, errorSpan);
      case "unary":
        return { kind: "boolean" };
      case "ternary":
        return this.inferExprType(expr.consequent, errorSpan);
      case "filter_chain":
        return this.inferExprType(expr.expr, errorSpan);
    }
  }

  private inferBinaryType(expr: BinaryExprNode, errorSpan?: Span): IrType | null {
    switch (expr.op) {
      case "==": case "!=":
      case "<": case ">": case "<=": case ">=":
        return { kind: "boolean" };
      case "&&": case "||":
        return this.inferExprType(expr.left, errorSpan);
    }
  }

  private resolvePath(segments: readonly string[], errorSpan?: Span): IrType | null {
    if (segments.length === 0) return null;
    const name = segments[0]!;
    const entry = this.scope.lookup(name);
    if (!entry) {
      if (errorSpan) {
        this.addError("E001", `Undefined variable reference: "${name}"`, errorSpan);
      }
      return null;
    }
    let type = entry.type;
    for (let i = 1; i < segments.length; i++) {
      if (type.kind === "object") {
        const field = type.fields[segments[i]!];
        if (!field) {
          if (errorSpan) {
            this.addError("E003", `Property "${segments[i]}" does not exist on type`, errorSpan);
          }
          return null;
        }
        type = field;
      } else if (type.kind === "nullable" || type.kind === "optional") {
        const inner = (type as any).inner as IrType;
        if (inner.kind === "object") {
          const field = inner.fields[segments[i]!];
          if (!field) {
            if (errorSpan) {
              this.addError("E003", `Property "${segments[i]}" does not exist on type`, errorSpan);
            }
            return null;
          }
          type = field;
        } else {
          return null;
        }
      } else if (type.kind === "record") {
        return type.value;
      } else if (type.kind === "array") {
        if (i === segments.length - 1) {
          return type.item;
        }
        return null;
      } else if (type.kind === "union") {
        // Find first object variant
        const objVariant = type.variants.find(v => v.kind === "object");
        if (objVariant && objVariant.kind === "object") {
          const field = objVariant.fields[segments[i]!];
          if (!field) {
            if (errorSpan) {
              this.addError("E003", `Property "${segments[i]}" does not exist on type`, errorSpan);
            }
            return null;
          }
          type = field;
        } else {
          return null;
        }
      } else {
        if (errorSpan) {
          this.addError("E003", `Property "${segments[i]}" does not exist on ${type.kind}`, errorSpan);
        }
        return null;
      }
    }
    return type;
  }

  private typeExprToIrType(typeExpr: TypeExprNode): IrType {
    switch (typeExpr.kind) {
      case "string":  return { kind: "string" };
      case "number":  return { kind: "number" };
      case "boolean": return { kind: "boolean" };
      case "date":    return { kind: "date" };
      case "null":    return { kind: "null" };
      case "array":   return { kind: "array", item: this.typeExprToIrType(typeExpr.item) };
      case "record":  return { kind: "record", value: this.typeExprToIrType(typeExpr.value) };
      case "object": {
        const fields: Record<string, IrType> = {};
        for (const f of typeExpr.fields) {
          fields[f.name] = f.optional
            ? { kind: "optional", inner: this.typeExprToIrType(f.typeExpr) }
            : this.typeExprToIrType(f.typeExpr);
        }
        return { kind: "object", fields };
      }
      case "union": {
        const variants = typeExpr.variants.map(v => this.typeExprToIrType(v));
        if (variants.some(v => v.kind === "null")) {
          const nonNull = variants.filter(v => v.kind !== "null");
          return nonNull.length === 1 ? { kind: "nullable", inner: nonNull[0]! } : { kind: "union", variants };
        }
        return { kind: "union", variants };
      }
      case "named":
        return { kind: "string" };
    }
  }

  private addError(code: ErrorCode, message: string, span: Span): void {
    this.errors.push({
      code,
      message: `${ERROR_CODES[code]}: ${message}`,
      span,
      sourceFile: this.sourceFile,
    });
  }
}
