import { Token, TokenType } from "../lexer/token";
import { Span } from "../error";
import { ParseError } from "./error";
import {
  AstNode, ExprNode, OutputMode, ContextFieldNode, TypeExprNode,
  BinaryOp, RenderProp, CacheKeyPart,
  TemplateNode, OutputModeNode, ContextDeclNode, LiteralNode, InterpNode,
  IfNode, EachNode, AsyncBlockNode, LetNode, CacheBlockNode, BoundaryNode,
  LayoutNode, SlotContentNode, SlotDefNode, ImportNode, RenderNode,
  RecursiveDefNode, RecursiveCallNode, HeadPushNode,
  HeadTitleNode, HeadMetaNode, HeadCanonicalNode, HeadJsonLdNode,
  StyleBlockNode, StylesTargetNode, ScriptBlockNode, ScriptsTargetNode,
  HeadTargetNode, CsrfNode, AssetNode, JsonNode, NonceRefNode,
  DebugNode, TranslateNode, FilterChainNode, FilterNode,
} from "./ast";

const BINARY_OPS: Record<string, { prec: number; op: BinaryOp }> = {
  "||": { prec: 1, op: "||" },
  "&&": { prec: 2, op: "&&" },
  "==": { prec: 3, op: "==" },
  "!=": { prec: 3, op: "!=" },
  "<":  { prec: 4, op: "<" },
  ">":  { prec: 4, op: ">" },
  "<=": { prec: 4, op: "<=" },
  ">=": { prec: 4, op: ">=" },
};

export class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): TemplateNode {
    const nodes: AstNode[] = [];
    while (!this.isAtEnd()) {
      this.skipSpace();
      if (this.isAtEnd()) break;
      nodes.push(this.parseNode());
    }
    return {
      kind: "template",
      nodes,
      span: nodes.length > 0
        ? { start: nodes[0]!.span.start, end: nodes[nodes.length - 1]!.span.end, line: nodes[0]!.span.line, col: nodes[0]!.span.col }
        : { start: 0, end: 0, line: 1, col: 1 },
    };
  }

  private parseNode(): AstNode {
    if (this.check("OUTPUT")) return this.parseOutputMode();
    if (this.check("CONTEXT")) return this.parseContextDecl();
    if (this.check("IF") || this.check("TRIM_IF")) return this.parseIf();
    if (this.check("EACH") || this.check("TRIM_EACH")) return this.parseEach();
    if (this.check("ASYNC") || this.check("TRIM_ASYNC")) return this.parseAsyncBlock();
    if (this.check("LET")) return this.parseLet();
    if (this.check("CACHE") || this.check("TRIM_CACHE")) return this.parseCacheBlock();
    if (this.check("BOUNDARY") || this.check("TRIM_BOUNDARY")) return this.parseBoundary();
    if (this.check("LAYOUT")) return this.parseLayout();
    if (this.check("SLOT")) return this.parseSlotDef();
    if (this.check("IMPORT")) return this.parseImport();
    if (this.check("RENDER")) return this.parseRender();
    if (this.check("RECURSIVE")) return this.parseRecursiveDef();
    if (this.check("RECURSE")) return this.parseRecursiveCall();
    if (this.check("HEAD")) return this.parseHeadPush();
    if (this.check("STYLE") || this.check("TRIM_STYLE")) return this.parseStyleBlock();
    if (this.check("STYLES")) return this.parseStylesTarget();
    if (this.check("SCRIPT") || this.check("TRIM_SCRIPT")) return this.parseScriptBlock();
    if (this.check("SCRIPTS")) return this.parseScriptsTarget();
    if (this.check("CSRF")) return this.parseCsrf();
    if (this.check("ASSET")) return this.parseAsset();
    if (this.check("JSON")) return this.parseJson();
    if (this.check("NONCE")) return this.parseNonceRef();
    if (this.check("DEBUG")) return this.parseDebug();
    if (this.check("T")) return this.parseTranslate();
    if (this.check("LITERAL") || this.check("IDENTIFIER") || this.check("NUMBER") || this.check("STRING") || this.check("BOOLEAN") || this.check("NULL") || this.check("DOT") || this.check("LPAREN") || this.check("RPAREN") || this.check("COMMA") || this.check("COLON") || this.check("LBRACE") || this.check("GT") || this.check("LT") || this.check("MINUS") || this.check("EQUALS") || this.check("NOT") || this.check("AND") || this.check("OR") || this.check("PIPE") || this.check("QUESTION") || this.check("SPREAD") || this.check("EQ") || this.check("NEQ") || this.check("GTE") || this.check("LTE")) return this.parseContentBlock();
    if (this.check("INTERP_OPEN") || this.check("INTERP_OPEN_TRIM") || this.check("INTERP_OPEN_RAW")) return this.parseInterp();
    if (this.check("TRIM_CLOSE_IF") || this.check("CLOSE_IF") || this.check("CLOSE_IF_TRIM")) {
      this.advance();
      if (this.isAtEnd()) return { kind: "literal", value: "", span: { start: -1, end: -1, line: -1, col: -1 } };
      return this.parseNode();
    }
    if (this.check("ELSE") || this.check("ELSE_IF")) {
      // These should be handled by parseIf
      throw this.error(`Unexpected @else or @else if without matching @if`);
    }
    if (this.check("EMPTY")) {
      throw this.error("Unexpected @empty without matching @each");
    }
    if (this.check("LOADING")) {
      throw this.error("Unexpected @loading without matching @async");
    }
    if (this.check("FALLBACK")) {
      throw this.error("Unexpected @fallback without matching @boundary");
    }
    if (this.check("RBRACE")) {
      const tok = this.peek();
      this.advance();
      return { kind: "literal", value: "", span: tok.span };
    }
    // Filter chain pipe check
    if (this.check("PIPE")) {
      return { kind: "literal", value: "", span: this.peek().span };
    }
    if (this.isAtEnd()) {
      return { kind: "literal", value: "", span: { start: -1, end: -1, line: -1, col: -1 } };
    }
    throw this.error(`Unexpected token: ${this.peek().type} ("${this.peek().value}")`);
  }

  private parseOutputMode(): OutputModeNode {
    const tok = this.advance();
    this.consume("LPAREN", "Expected ( after @output");
    const modeTok = this.consume("IDENTIFIER", "Expected output mode (html, text, xml)");
    const mode = modeTok.value as OutputMode;
    if (mode !== "html" && mode !== "text" && mode !== "xml") {
      throw this.error(`Unknown output mode: ${modeTok.value}`, modeTok.span);
    }
    this.consume("RPAREN", "Expected ) after output mode");
    return { kind: "output_mode", mode, span: tok.span };
  }

  private parseContextDecl(): ContextDeclNode {
    const tok = this.advance();
    this.consume("LBRACE", "Expected { after @context");
    const fields = this.parseContextFields();
    this.consume("RBRACE", "Expected } after @context block");
    return { kind: "context_decl", fields, span: tok.span };
  }

  private parseContextFields(): ContextFieldNode[] {
    const fields: ContextFieldNode[] = [];
    while (!this.isAtEnd()) {
      while (this.check("LITERAL") && this.peek().value.trim() === "") {
        this.advance();
      }
      if (this.check("RBRACE")) break;
      const nameTok = this.consume("IDENTIFIER", "Expected field name in @context");
      const optional = this.match("QUESTION");
      this.consume("COLON", "Expected : after field name");
      const typeExpr = this.parseTypeExpr();
      fields.push({ name: nameTok.value, typeExpr, optional, span: nameTok.span });
    }
    return fields;
  }

  private parseTypeExpr(): TypeExprNode {
    while (this.check("LITERAL") && this.peek().value.trim() === "") {
      this.advance();
    }
    if (this.check("IDENTIFIER")) {
      const name = this.advance().value;
      if (name === "string")  return { kind: "string" };
      if (name === "number")  return { kind: "number" };
      if (name === "boolean") return { kind: "boolean" };
      if (name === "Date")    return { kind: "date" };
      if (name === "null")    return { kind: "null" };
      return { kind: "named", name };
    }
    if (this.check("STRING")) {
      const value = this.advance().value;
      return { kind: "union", variants: [{ kind: "string" }, ...this.parseUnionVariants(value)] };
    }
    if (this.check("LBRACE")) {
      return this.parseObjectType();
    }
    if (this.check("LBRACE")) {
      // already handled
    }
    throw this.error("Expected type expression");
  }

  private parseUnionVariants(firstValue?: string): TypeExprNode[] {
    const variants: TypeExprNode[] = [];
    if (firstValue !== undefined) {
      // Already consumed the string literal union variant
    }
    while (this.check("OR")) {
      this.advance();
      if (this.check("STRING")) {
        const val = this.advance().value;
        variants.push({ kind: "string" }); // string union member
      } else if (this.peek().value === "string") {
        this.advance();
        variants.push({ kind: "string" });
      } else if (this.peek().value === "number") {
        this.advance();
        variants.push({ kind: "number" });
      } else if (this.peek().value === "boolean") {
        this.advance();
        variants.push({ kind: "boolean" });
      } else if (this.peek().value === "null") {
        this.advance();
        variants.push({ kind: "null" });
      } else {
        const name = this.advance().value;
        variants.push({ kind: "named", name });
      }
    }
    return variants;
  }

  private parseObjectType(): TypeExprNode {
    this.consume("LBRACE", "Expected { for object type");
    const fields = this.parseContextFields();
    this.consume("RBRACE", "Expected } for object type");
    return { kind: "object", fields };
  }

  private readonly contentTokens = new Set<TokenType>([
    "LITERAL", "IDENTIFIER", "NUMBER", "STRING", "BOOLEAN", "NULL",
    "DOT", "LPAREN", "RPAREN", "COMMA", "COLON", "LBRACE",
    "GT", "LT", "MINUS", "EQUALS", "NOT", "AND", "OR", "PIPE", "QUESTION", "SPREAD",
    "EQ", "NEQ", "GTE", "LTE"
  ]);

  private parseContentBlock(): LiteralNode {
    let value = "";
    let firstSpan = this.peek().span;
    let lastSpan = firstSpan;
    while (!this.isAtEnd() && this.contentTokens.has(this.peek().type)) {
      const tok = this.advance();
      value += tok.value;
      lastSpan = tok.span;
    }
    return { kind: "literal", value, span: { start: firstSpan.start, end: lastSpan.end, line: firstSpan.line, col: firstSpan.col } };
  }

  private parseLiteral(): LiteralNode {
    const tok = this.advance();
    return { kind: "literal", value: tok.value, span: tok.span };
  }

  private parseInterp(): InterpNode {
    const openTok = this.advance();
    const trimStart = openTok.type === "INTERP_OPEN_TRIM";
    const raw = openTok.type === "INTERP_OPEN_RAW";
    let expr: ExprNode = this.parseExpr();
    // Parse filter chain: expr | filter | filter(args) | ...
    if (this.check("PIPE")) {
      const filters: FilterNode[] = [];
      while (this.check("PIPE")) {
        this.advance();
        const nameTok = this.consume("IDENTIFIER", "Expected filter name after |");
        const args: ExprNode[] = [];
        if (this.check("LPAREN")) {
          this.advance();
          if (!this.check("RPAREN")) {
            args.push(this.parseExpr());
            while (this.match("COMMA")) {
              args.push(this.parseExpr());
            }
          }
          this.consume("RPAREN", "Expected ) after filter arguments");
        }
        filters.push({ name: nameTok.value, args, span: nameTok.span });
      }
      const lastSpan = filters[filters.length - 1]!.span;
      expr = { kind: "filter_chain", expr, filters, span: { start: expr.span.start, end: lastSpan.end, line: expr.span.line, col: expr.span.col } };
    }
    const closeTok = this.check("INTERP_CLOSE") || this.check("INTERP_CLOSE_TRIM") || this.check("INTERP_CLOSE_RAW")
      ? this.advance()
      : this.consume("INTERP_CLOSE", "Expected }} after expression");
    const trimEnd = closeTok.type === "INTERP_CLOSE_TRIM";
    const span = { start: openTok.span.start, end: closeTok.span.end, line: openTok.span.line, col: openTok.span.col };
    return { kind: "interp", expr, trimStart, trimEnd, raw, span };
  }

  private parseIf(): IfNode {
    const tok = this.advance();
    const trimStart = tok.type === "TRIM_IF";
    this.consume("LPAREN", "Expected ( after @if");
    const condition = this.parseExpr();
    this.consume("RPAREN", "Expected ) after condition");
    this.consume("LBRACE", "Expected { for @if body");
    const consequent = this.parseBlockBody("RBRACE");
    this.consume("RBRACE", "Expected } after @if body");

    const elseIfs: { condition: ExprNode; body: AstNode[] }[] = [];
    let alternate: AstNode[] | null = null;

    this.skipSpace();
    while (this.check("ELSE_IF")) {
      const eiTok = this.advance();
      this.consume("LPAREN", "Expected ( after @else if");
      const eiCond = this.parseExpr();
      this.consume("RPAREN", "Expected ) after @else if condition");
      this.consume("LBRACE", "Expected { for @else if body");
      const eiBody = this.parseBlockBody("RBRACE");
      this.consume("RBRACE", "Expected } after @else if body");
      elseIfs.push({ condition: eiCond, body: eiBody });
      this.skipSpace();
    }

    this.skipSpace();
    if (this.check("ELSE")) {
      this.advance();
      this.consume("LBRACE", "Expected { for @else body");
      alternate = this.parseBlockBody("RBRACE");
      this.consume("RBRACE", "Expected } after @else body");
    }

    let trimEnd = false;
    if (this.check("TRIM_CLOSE_IF") || this.check("CLOSE_IF") || this.check("CLOSE_IF_TRIM")) {
      const closeTok = this.advance();
      if (closeTok.type === "CLOSE_IF_TRIM" || closeTok.type === "TRIM_CLOSE_IF") {
        trimEnd = true;
      }
    }

    return {
      kind: "if", condition, consequent, elseIfs, alternate, trimStart, trimEnd,
      span: tok.span,
    };
  }

  private parseEach(): EachNode {
    const tok = this.advance();
    this.consume("LPAREN", "Expected ( after @each");
    const itemTok = this.consume("IDENTIFIER", "Expected item name in @each");
    let indexName: string | null = null;
    this.skipSpace();
    if (this.match("COMMA")) {
      const idxTok = this.consume("IDENTIFIER", "Expected index name after comma");
      indexName = idxTok.value;
      const inTok = this.consume("IDENTIFIER", "Expected 'in' in @each");
      if (inTok.value !== "in") throw this.error("Expected 'in' in @each", inTok.span);
      const source = this.parseExpr();
      this.consume("RPAREN", "Expected ) after @each source");
      this.consume("LBRACE", "Expected { for @each body");
      const body = this.parseBlockBody("RBRACE");
      this.consume("RBRACE", "Expected } after @each body");
      let empty: AstNode[] = [];
      this.skipSpace();
      if (this.check("EMPTY")) {
        this.advance();
        this.consume("LBRACE", "Expected { for @empty body");
        empty = this.parseBlockBody("RBRACE");
        this.consume("RBRACE", "Expected } after @empty body");
      }
      return { kind: "each", itemName: itemTok.value, indexName, source, body, empty, span: tok.span };
    }
    const inTok = this.consume("IDENTIFIER", "Expected 'in' in @each");
    if (inTok.value !== "in") throw this.error("Expected 'in' in @each", inTok.span);
    const source = this.parseExpr();
    this.consume("RPAREN", "Expected ) after @each source");
    this.consume("LBRACE", "Expected { for @each body");
    const body = this.parseBlockBody("RBRACE");
    this.consume("RBRACE", "Expected } after @each body");
    let empty: AstNode[] = [];
    this.skipSpace();
    if (this.check("EMPTY")) {
      this.advance();
      this.consume("LBRACE", "Expected { for @empty body");
      empty = this.parseBlockBody("RBRACE");
      this.consume("RBRACE", "Expected } after @empty body");
    }
    return { kind: "each", itemName: itemTok.value, indexName, source, body, empty, span: tok.span };
  }

  private parseAsyncBlock(): AsyncBlockNode {
    const tok = this.advance();
    this.consume("LPAREN", "Expected ( after @async");
    const bindingTok = this.consume("IDENTIFIER", "Expected binding name in @async");
    const fromTok = this.consume("IDENTIFIER", "Expected 'from' in @async");
    if (fromTok.value !== "from") throw this.error("Expected 'from' in @async", fromTok.span);
    const fetcherTok = this.consume("IDENTIFIER", "Expected fetcher name in @async");
    const args: ExprNode[] = [];
    if (this.match("LPAREN")) {
      if (!this.check("RPAREN")) {
        args.push(this.parseExpr());
        while (this.match("COMMA")) {
          args.push(this.parseExpr());
        }
      }
      this.consume("RPAREN", "Expected ) after fetcher args");
    }
    this.consume("RPAREN", "Expected ) after @async declaration");

    this.consume("LBRACE", "Expected { for @async body");
    const body = this.parseBlockBody("RBRACE");
    this.consume("RBRACE", "Expected } after @async body");

    let loading: AstNode[] = [];
    this.skipSpace();
    if (this.check("LOADING")) {
      this.advance();
      this.consume("LBRACE", "Expected { for @loading body");
      loading = this.parseBlockBody("RBRACE");
      this.consume("RBRACE", "Expected } after @loading body");
    }

    let errorBinding: string | null = null;
    let error: AstNode[] = [];
    this.skipSpace();
    if (this.check("ERROR")) {
      this.advance();
      this.skipSpace();
      if (this.match("LPAREN")) {
        const errTok = this.consume("IDENTIFIER", "Expected error binding name");
        errorBinding = errTok.value;
        this.consume("RPAREN", "Expected ) after error binding");
      }
      this.consume("LBRACE", "Expected { for @error body");
      error = this.parseBlockBody("RBRACE");
      this.consume("RBRACE", "Expected } after @error body");
    }

    return { kind: "async_block", binding: bindingTok.value, fetcher: fetcherTok.value, args, body, loading, errorBinding, error, span: tok.span };
  }

  private parseLet(): LetNode {
    const tok = this.advance();
    const nameTok = this.consume("IDENTIFIER", "Expected variable name after @let");
    this.consume("EQUALS", "Expected = after @let variable name");
    const value = this.parseExpr();
    return { kind: "let", name: nameTok.value, value, span: tok.span };
  }

  private parseCacheBlock(): CacheBlockNode {
    const tok = this.advance();
    this.consume("LPAREN", "Expected ( after @cache");
    this.consume("IDENTIFIER", "Expected 'key' parameter");
    this.consume("COLON", "Expected : after key");
    const keyStrTok = this.consume("STRING", "Expected string key expression");
    const keyParts = this.parseCacheKey(keyStrTok.value);
    this.match("COMMA");
    this.consume("IDENTIFIER", "Expected 'ttl' parameter");
    this.consume("COLON", "Expected : after ttl");
    const ttlTok = this.consume("NUMBER", "Expected numeric ttl value");
    this.consume("RPAREN", "Expected ) after @cache params");
    this.consume("LBRACE", "Expected { for @cache body");
    const body = this.parseBlockBody("RBRACE");
    this.consume("RBRACE", "Expected } after @cache body");
    return { kind: "cache_block", keyParts, ttl: parseInt(ttlTok.value, 10), body, span: tok.span };
  }

  private parseCacheKey(keyStr: string): CacheKeyPart[] {
    const parts: CacheKeyPart[] = [];
    let i = 0;
    while (i < keyStr.length) {
      if (keyStr[i] === "{" && keyStr[i + 1] === "{") {
        i += 2;
        let exprStr = "";
        while (i < keyStr.length && !(keyStr[i] === "}" && keyStr[i + 1] === "}")) {
          exprStr += keyStr[i];
          i++;
        }
        i += 2; // skip }}
        parts.push({ kind: "expr", expr: { kind: "path", segments: exprStr.trim().split("."), span: tokSpan() } });
      } else {
        let lit = "";
        while (i < keyStr.length && !(keyStr[i] === "{" && keyStr[i + 1] === "{")) {
          lit += keyStr[i];
          i++;
        }
        parts.push({ kind: "literal", value: lit });
      }
    }
    return parts;
  }

  private parseBoundary(): BoundaryNode {
    const tok = this.advance();
    this.consume("LBRACE", "Expected { for @boundary body");
    const body = this.parseBlockBody("RBRACE");
    this.consume("RBRACE", "Expected } after @boundary body");

    let errorBinding: string | null = null;
    let fallback: AstNode[] = [];
    this.skipSpace();
    if (this.check("FALLBACK")) {
      this.advance();
      this.skipSpace();
      if (this.match("LPAREN")) {
        const errTok = this.consume("IDENTIFIER", "Expected error binding name");
        errorBinding = errTok.value;
        this.consume("RPAREN", "Expected ) after error binding");
      }
      this.consume("LBRACE", "Expected { for @fallback body");
      fallback = this.parseBlockBody("RBRACE");
      this.consume("RBRACE", "Expected } after @fallback body");
    }
    return { kind: "boundary", body, errorBinding, fallback, span: tok.span };
  }

  private parseLayout(): LayoutNode {
    const tok = this.advance();
    const pathTok = this.consume("STRING", "Expected layout path string");
    this.consume("LBRACE", "Expected { for @layout body");
    const slots = this.parseSlotContents();
    this.consume("RBRACE", "Expected } after @layout body");
    return { kind: "layout", path: pathTok.value, slots, span: tok.span };
  }

  private parseSlotContents(): SlotContentNode[] {
    const slots: SlotContentNode[] = [];
    while (!this.check("RBRACE") && !this.isAtEnd()) {
      if (this.check("SLOT")) {
        const slotTok = this.advance();
        const nameTok = this.consume("IDENTIFIER", "Expected slot name");
        this.consume("LBRACE", "Expected { for slot content");
        const body = this.parseBlockBody("RBRACE");
        this.consume("RBRACE", "Expected } after slot content");
        slots.push({ name: nameTok.value, body, span: slotTok.span });
      } else if (this.check("LITERAL")) {
        this.advance(); // skip whitespace literal between slots
      } else {
        break;
      }
    }
    return slots;
  }

  private parseSlotDef(): SlotDefNode {
    const tok = this.advance();
    const nameTok = this.consume("IDENTIFIER", "Expected slot name");
    let defaultBody: AstNode[] | null = null;
    if (this.match("LBRACE")) {
      defaultBody = this.parseBlockBody("RBRACE");
      this.consume("RBRACE", "Expected } after slot default");
    }
    return { kind: "slot_def", name: nameTok.value, defaultBody, span: tok.span };
  }

  private parseImport(): ImportNode {
    const tok = this.advance();
    this.consume("LBRACE", "Expected { after @import");
    const names: string[] = [];
    const first = this.consume("IDENTIFIER", "Expected component name");
    names.push(first.value);
    while (this.match("COMMA")) {
      const name = this.consume("IDENTIFIER", "Expected component name");
      names.push(name.value);
    }
    this.consume("RBRACE", "Expected } after import names");
    this.consume("IDENTIFIER", "Expected 'from' keyword");
    const pathTok = this.consume("STRING", "Expected import path");
    return { kind: "import", names, path: pathTok.value, span: tok.span };
  }

  private parseRender(): RenderNode {
    const tok = this.advance();
    const nameTok = this.consume("IDENTIFIER", "Expected component name after @render");
    const props: RenderProp[] = [];
    if (this.match("LPAREN")) {
      if (this.match("LBRACE")) {
        if (!this.check("RBRACE")) {
          props.push(this.parseRenderProp());
          while (this.match("COMMA")) {
            props.push(this.parseRenderProp());
          }
        }
        this.consume("RBRACE", "Expected } after render props");
      }
      this.consume("RPAREN", "Expected ) after @render props");
    }
    return { kind: "render", name: nameTok.value, props, span: tok.span };
  }

  private parseRenderProp(): RenderProp {
    while (this.check("LITERAL") && this.peek().value.trim() === "") {
      this.advance();
    }
    if (this.check("SPREAD") || (this.peek().type === "DOT" && this.peek().value === "...")) {
      const spreadTok = this.advance();
      const nameTok = this.consume("IDENTIFIER", "Expected identifier after ...");
      return { kind: "spread", name: nameTok.value, span: spreadTok.span };
    }
    const nameTok = this.consume("IDENTIFIER", "Expected prop name");
    this.consume("COLON", "Expected : after prop name");
    const value = this.parseExpr();
    return { kind: "named", name: nameTok.value, value };
  }

  private parseRecursiveDef(): RecursiveDefNode {
    const tok = this.advance();
    const nameTok = this.consume("IDENTIFIER", "Expected recursive template name");
    this.consume("LPAREN", "Expected ( after recursive name");
    const paramTok = this.consume("IDENTIFIER", "Expected parameter name");
    this.consume("RPAREN", "Expected ) after parameter");
    this.consume("LBRACE", "Expected { for recursive body");
    const body = this.parseBlockBody("RBRACE");
    this.consume("RBRACE", "Expected } after recursive body");
    return { kind: "recursive_def", name: nameTok.value, param: paramTok.value, body, span: tok.span };
  }

  private parseRecursiveCall(): RecursiveCallNode {
    const tok = this.advance();
    const nameTok = this.consume("IDENTIFIER", "Expected recursive template name");
    this.consume("LPAREN", "Expected ( after recursive call");
    const arg = this.parseExpr();
    this.consume("RPAREN", "Expected ) after recursive arg");
    return { kind: "recursive_call", name: nameTok.value, arg, span: tok.span };
  }

  private parseHeadPush(): HeadPushNode {
    const tok = this.advance();
    this.consume("LBRACE", "Expected { after @head");
    const contributions = this.parseHeadContributions();
    this.consume("RBRACE", "Expected } after @head block");
    return { kind: "head_push", contributions, span: tok.span };
  }

  private parseHeadContributions(): HeadContribution[] {
    const contribs: HeadContribution[] = [];
    while (!this.check("RBRACE") && !this.isAtEnd()) {
      if (this.check("TITLE")) {
        const tTok = this.advance();
        this.consume("LBRACE", "Expected { for @title");
        const content = this.parseBlockBody("RBRACE");
        this.consume("RBRACE", "Expected } after @title");
        contribs.push({ kind: "head_title", content, span: tTok.span } as any);
      } else if (this.check("META")) {
        const mTok = this.advance();
        this.consume("LPAREN", "Expected ( after @meta");
        const attrs: Record<string, ExprNode> = {};
        if (!this.check("RPAREN")) {
          const first = this.parseMetaAttr();
          attrs[first.name] = first.value;
          while (this.match("COMMA")) {
            const attr = this.parseMetaAttr();
            attrs[attr.name] = attr.value;
          }
        }
        this.consume("RPAREN", "Expected ) after @meta attributes");
        contribs.push({ kind: "head_meta", attributes: attrs, span: mTok.span } as any);
      } else if (this.check("CANONICAL")) {
        const cTok = this.advance();
        this.consume("LPAREN", "Expected ( after @canonical");
        this.consume("IDENTIFIER", "Expected 'url' parameter");
        this.consume("COLON", "Expected : after url");
        const url = this.parseExpr();
        this.consume("RPAREN", "Expected ) after @canonical");
        contribs.push({ kind: "head_canonical", url, span: cTok.span } as any);
      } else if (this.check("JSONLD")) {
        const jTok = this.advance();
        this.consume("LBRACE", "Expected { for @jsonld");
        const content = this.parseBlockBody("RBRACE");
        this.consume("RBRACE", "Expected } after @jsonld");
        contribs.push({ kind: "head_jsonld", content, span: jTok.span } as any);
      } else if (this.check("LITERAL")) {
        this.advance();
      } else {
        break;
      }
    }
    return contribs;
  }

  private parseMetaAttr(): { name: string; value: ExprNode } {
    const nameTok = this.consume("IDENTIFIER", "Expected attribute name in @meta");
    this.consume("COLON", "Expected : after attribute name");
    const value = this.parseExpr();
    return { name: nameTok.value, value };
  }

  private parseStyleBlock(): StyleBlockNode {
    const tok = this.advance();
    let critical = false;
    if (this.match("LPAREN")) {
      const attrTok = this.consume("IDENTIFIER", "Expected style attribute");
      if (attrTok.value === "critical") critical = true;
      this.consume("RPAREN", "Expected ) after style attribute");
    }
    this.consume("LBRACE", "Expected { for @style body");
    let css = "";
    let depth = 1;
    while (!this.isAtEnd() && depth > 0) {
      if (this.check("LBRACE")) { css += "{"; this.advance(); depth++; }
      else if (this.check("RBRACE")) { css += "}"; this.advance(); depth--; }
      else { css += this.advance().value; }
    }
    if (depth !== 0) throw this.error("Expected } after @style body");
    return { kind: "style_block", css, critical, span: tok.span };
  }

  private parseStylesTarget(): StylesTargetNode {
    const tok = this.advance();
    return { kind: "styles_target", span: tok.span };
  }

  private parseScriptBlock(): ScriptBlockNode {
    const tok = this.advance();
    let attrType: string | null = null;
    if (this.match("LPAREN")) {
      const attrTok = this.consume("IDENTIFIER", "Expected script attribute (defer, async, module)");
      if (attrTok.value === "type") {
        this.consume("COLON", "Expected : after type");
        const typeTok = this.consume("STRING", "Expected type value");
        attrType = typeTok.value;
      }
      this.consume("RPAREN", "Expected ) after script attribute");
    }
    this.consume("LBRACE", "Expected { for @script body");
    let content: AstNode[] = [];
    let depth = 1;
    while (!this.isAtEnd() && depth > 0) {
      if (this.check("LBRACE")) { this.advance(); depth++; }
      else if (this.check("RBRACE")) { this.advance(); depth--; }
      else { content.push(this.parseNode()); }
    }
    return { kind: "script_block", scriptType: "inline", attrType, content, span: tok.span };
  }

  private parseScriptsTarget(): ScriptsTargetNode {
    const tok = this.advance();
    return { kind: "scripts_target", span: tok.span };
  }

  private parseCsrf(): CsrfNode {
    const tok = this.advance();
    return { kind: "csrf", span: tok.span };
  }

  private parseAsset(): AssetNode {
    const tok = this.advance();
    this.consume("LPAREN", "Expected ( after @asset");
    const pathTok = this.consume("STRING", "Expected asset path");
    this.consume("RPAREN", "Expected ) after @asset");
    return { kind: "asset", path: pathTok.value, span: tok.span };
  }

  private parseJson(): JsonNode {
    const tok = this.advance();
    this.consume("LPAREN", "Expected ( after @json");
    const expr = this.parseExpr();
    this.consume("RPAREN", "Expected ) after @json");
    return { kind: "json", expr, span: tok.span };
  }

  private parseNonceRef(): NonceRefNode {
    const tok = this.advance();
    return { kind: "nonce_ref", span: tok.span };
  }

  private parseDebug(): DebugNode {
    const tok = this.advance();
    let path: string[] | null = null;
    if (this.match("LPAREN")) {
      const pathTok = this.parseExpr();
      if (pathTok.kind === "path") {
        path = (pathTok as any).segments;
      }
      this.consume("RPAREN", "Expected ) after @debug");
    }
    return { kind: "debug", path, span: tok.span };
  }

  private parseTranslate(): TranslateNode {
    const tok = this.advance();
    this.consume("LPAREN", "Expected ( after @t");
    const keyTok = this.consume("STRING", "Expected translation key");
    const args: Record<string, ExprNode> = {};
    if (this.match("COMMA")) {
      this.consume("LBRACE", "Expected { for translation args");
      if (!this.check("RBRACE")) {
        const nameTok = this.consume("IDENTIFIER", "Expected arg name");
        this.consume("COLON", "Expected : after arg name");
        args[nameTok.value] = this.parseExpr();
        while (this.match("COMMA")) {
          const nTok = this.consume("IDENTIFIER", "Expected arg name");
          this.consume("COLON", "Expected : after arg name");
          args[nTok.value] = this.parseExpr();
        }
      }
      this.consume("RBRACE", "Expected } after translation args");
    }
    this.consume("RPAREN", "Expected ) after @t");
    return { kind: "translate", key: keyTok.value, args, span: tok.span };
  }

  private parseExpr(): ExprNode {
    return this.parseTernary();
  }

  private parseTernary(): ExprNode {
    let expr = this.parseBinary(0);
    if (this.check("QUESTION")) {
      const qTok = this.advance();
      const consequent = this.parseExpr();
      this.consume("COLON", "Expected : in ternary expression");
      const alternate = this.parseExpr();
      expr = { kind: "ternary", condition: expr, consequent, alternate, span: qTok.span };
    }
    return expr;
  }

  private parseBinary(minPrec: number): ExprNode {
    let left = this.parseUnary();
    while (true) {
      while (this.check("LITERAL") && this.peek().value.trim() === "") {
        this.advance();
      }
      const opInfo = BINARY_OPS[this.peek().value];
      if (!opInfo || opInfo.prec < minPrec) break;
      this.advance();
      const right = this.parseBinary(opInfo.prec + 1);
      left = {
        kind: "binary",
        op: opInfo.op,
        left,
        right,
        span: { start: left.span.start, end: right.span.end, line: left.span.line, col: left.span.col },
      };
    }
    return left;
  }

  private parseUnary(): ExprNode {
    if (this.check("NOT") || this.peek().value === "!") {
      const tok = this.advance();
      const operand = this.parseUnary();
      return { kind: "unary", op: "!", operand, span: tok.span };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExprNode {
    while (this.check("LITERAL") && this.peek().value.trim() === "") {
      this.advance();
    }
    if (this.check("STRING")) {
      const tok = this.advance();
      return { kind: "string", value: tok.value, span: tok.span };
    }
    if (this.check("NUMBER")) {
      const tok = this.advance();
      return { kind: "number", value: parseFloat(tok.value), span: tok.span };
    }
    if (this.check("BOOLEAN")) {
      const tok = this.advance();
      return { kind: "boolean", value: tok.value === "true", span: tok.span };
    }
    if (this.check("NULL")) {
      const tok = this.advance();
      return { kind: "null", span: tok.span };
    }
    if (this.check("IDENTIFIER")) {
      const tok = this.advance();
      const segments: string[] = [tok.value];
      while (this.match("DOT")) {
        const segTok = this.consume("IDENTIFIER", "Expected identifier after .");
        segments.push(segTok.value);
      }
      return { kind: "path", segments, span: tok.span };
    }
    if (this.check("INTERP_OPEN") || this.check("INTERP_OPEN_TRIM") || this.check("INTERP_OPEN_RAW")) {
      return this.parseInterp().expr;
    }
    if (this.check("LPAREN")) {
      this.advance();
      const expr = this.parseExpr();
      this.consume("RPAREN", "Expected ) after expression");
      return expr;
    }
    throw this.error(`Unexpected token in expression: ${this.peek().type}`);
  }

  private parseBlockBody(endType: string): AstNode[] {
    const nodes: AstNode[] = [];
    while (!this.check(endType as TokenType) && !this.isAtEnd()) {
      nodes.push(this.parseNode());
    }
    return nodes;
  }

  // Lookup helpers
  private lookbehind: Token | null = null;

  private check(type: TokenType): boolean {
    return !this.isAtEnd() && this.peek().type === type;
  }

  private match(type: TokenType): boolean {
    if (this.check(type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private advance(): Token {
    if (this.isAtEnd()) {
      throw this.error("Unexpected end of input");
    }
    const tok = this.tokens[this.pos]!;
    this.lookbehind = tok;
    this.pos++;
    return tok;
  }

  private skipSpace(): void {
    while (!this.isAtEnd() && this.check("LITERAL") && this.peek().value.trim() === "") {
      this.advance();
    }
  }

  private consume(type: TokenType, message: string): Token {
    this.skipSpace();
    if (this.check(type)) return this.advance();
    throw this.error(message);
  }

  private peek(): Token {
    return this.tokens[this.pos]!;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.tokens.length || this.peek().type === "EOF";
  }

  private error(message: string, span?: Span): ParseError {
    const tok = span ? null : this.peek();
    return new ParseError(message, span ?? tok?.span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
}

// Helper for head contribution type union
type HeadContribution =
  | ({ kind: "head_title" } & HeadTitleNode)
  | ({ kind: "head_meta" } & HeadMetaNode)
  | ({ kind: "head_canonical" } & HeadCanonicalNode)
  | ({ kind: "head_jsonld" } & HeadJsonLdNode);

function tokSpan(): Span {
  return { start: 0, end: 0, line: 0, col: 0 };
}
