import { Token, TokenType, token } from "./token";
import { Span, StncilError } from "../error";

const KEYWORDS: Record<string, TokenType> = {
  "output": "OUTPUT",
  "context": "CONTEXT",
  "if": "IF",
  "else": "ELSE",
  "each": "EACH",
  "empty": "EMPTY",
  "async": "ASYNC",
  "loading": "LOADING",
  "error": "ERROR",
  "let": "LET",
  "cache": "CACHE",
  "layout": "LAYOUT",
  "slot": "SLOT",
  "import": "IMPORT",
  "render": "RENDER",
  "recursive": "RECURSIVE",
  "recurse": "RECURSE",
  "head": "HEAD",
  "title": "TITLE",
  "meta": "META",
  "canonical": "CANONICAL",
  "jsonld": "JSONLD",
  "style": "STYLE",
  "script": "SCRIPT",
  "styles": "STYLES",
  "scripts": "SCRIPTS",
  "csrf": "CSRF",
  "asset": "ASSET",
  "json": "JSON",
  "nonce": "NONCE",
  "debug": "DEBUG",
  "t": "T",
  "boundary": "BOUNDARY",
  "fallback": "FALLBACK",
};

const TRIM_KEYWORDS: Record<string, TokenType> = {
  "if": "TRIM_IF",
  "each": "TRIM_EACH",
  "async": "TRIM_ASYNC",
  "cache": "TRIM_CACHE",
  "boundary": "TRIM_BOUNDARY",
  "style": "TRIM_STYLE",
  "script": "TRIM_SCRIPT",
};

export class Lexer {
  private pos = 0;
  private line = 1;
  private col = 1;
  private tokens: Token[] = [];
  private inInterpolation = false;

  constructor(private readonly source: string) {}

  tokenize(): Token[] {
    while (this.pos < this.source.length) {
      if (this.match("@*")) {
        this.readBlockComment();
        continue;
      }
      if (this.peek() === "@") {
        this.readSigil();
        continue;
      }
      if (this.match("{{{")) {
        this.addToken("INTERP_OPEN_RAW", "{{{");
        this.inInterpolation = true;
        continue;
      }
      if (this.match("{{-")) {
        this.addToken("INTERP_OPEN_TRIM", "{{-");
        this.inInterpolation = true;
        continue;
      }
      if (this.match("{{")) {
        this.addToken("INTERP_OPEN", "{{");
        this.inInterpolation = true;
        continue;
      }
      if (this.inInterpolation) {
        if (this.match("}}}")) {
          this.addToken("INTERP_CLOSE_RAW", "}}}");
          this.inInterpolation = false;
          continue;
        }
        if (this.match("-}}")) {
          this.addToken("INTERP_CLOSE_TRIM", "-}}");
          this.inInterpolation = false;
          continue;
        }
        if (this.match("}}")) {
          this.addToken("INTERP_CLOSE", "}}");
          this.inInterpolation = false;
          continue;
        }
        if (this.peek() === "\n") {
          throw new LexError("Unclosed {{ interpolation", this.makeSpan(this.pos, this.pos, this.line, this.col));
        }
        if (this.peek() === " " || this.peek() === "\t") {
          this.pos++; this.col++; continue;
        }
      }
      if (/[a-zA-Z_]/.test(this.peek())) {
        const ident = this.readWord();
        if (ident === "true" || ident === "false") this.addToken("BOOLEAN", ident);
        else if (ident === "null") this.addToken("NULL", ident);
        else this.addToken("IDENTIFIER", ident);
        continue;
      }
      if (/[0-9]/.test(this.peek())) {
        this.addToken("NUMBER", this.readNumber());
        continue;
      }
      if (this.peek() === '"') {
        this.addToken("STRING", this.readString());
        continue;
      }
      if (this.match("-@if")) {
        this.addToken("TRIM_CLOSE_IF", "-@if");
        continue;
      }
      if (this.peek() === "(") { this.addToken("LPAREN", "("); this.pos++; this.col++; continue; }
      if (this.peek() === ")") { this.addToken("RPAREN", ")"); this.pos++; this.col++; continue; }
      if (this.peek() === "{" && this.source[this.pos + 1] !== "{") {
        if (!this.inInterpolation) {
          this.addToken("LBRACE", "{"); this.pos++; this.col++; continue;
        }
        this.addToken("LITERAL", "{"); this.pos++; this.col++; continue;
      }
      if (this.peek() === "}") {
        if (this.inInterpolation) {
          const next = this.source[this.pos + 1];
          if (next === "}") {
            // }} should be handled above
          }
          this.addToken("LITERAL", "}"); this.pos++; this.col++; continue;
        }
        this.addToken("RBRACE", "}"); this.pos++; this.col++; continue;
      }
      if (this.peek() === ",") { this.addToken("COMMA", ","); this.pos++; this.col++; continue; }
      if (this.peek() === ":") { this.addToken("COLON", ":"); this.pos++; this.col++; continue; }
      if (this.startsWith(">=")) { this.addToken("GTE", ">="); this.pos += 2; this.col += 2; continue; }
      if (this.peek() === ">") { this.addToken("GT", ">"); this.pos++; this.col++; continue; }
      if (this.startsWith("<=")) { this.addToken("LTE", "<="); this.pos += 2; this.col += 2; continue; }
      if (this.peek() === "<") { this.addToken("LT", "<"); this.pos++; this.col++; continue; }
      if (this.startsWith("!=")) { this.addToken("NEQ", "!="); this.pos += 2; this.col += 2; continue; }
      if (this.peek() === "!") { this.addToken("NOT", "!"); this.pos++; this.col++; continue; }
      if (this.startsWith("==")) { this.addToken("EQ", "=="); this.pos += 2; this.col += 2; continue; }
      if (this.peek() === "=") { this.addToken("EQUALS", "="); this.pos++; this.col++; continue; }
      if (this.startsWith("||")) { this.addToken("OR", "||"); this.pos += 2; this.col += 2; continue; }
      if (this.startsWith("&&")) { this.addToken("AND", "&&"); this.pos += 2; this.col += 2; continue; }
      if (this.startsWith("...")) { this.addToken("SPREAD", "..."); this.pos += 3; this.col += 3; continue; }
      if (this.peek() === ".") { this.addToken("DOT", "."); this.pos++; this.col++; continue; }
      if (this.peek() === "|") { this.addToken("PIPE", "|"); this.pos++; this.col++; continue; }
      if (this.peek() === "-") { this.addToken("MINUS", "-"); this.pos++; this.col++; continue; }
      if (this.peek() === "?") { this.addToken("QUESTION", "?"); this.pos++; this.col++; continue; }
      if (this.peek() === "&") { this.addToken("AND", "&"); this.pos++; this.col++; continue; }
      if (this.peek() === ";") { this.addToken("LITERAL", ";"); this.pos++; this.col++; continue; }
      this.readLiteral();
    }
    this.addToken("EOF", "");
    return this.tokens;
  }

  private readBlockComment(): void {
    while (this.pos < this.source.length) {
      if (this.match("*@")) return;
      if (this.peek() === "\n") { this.line++; this.col = 1; }
      this.pos++;
      this.col++;
    }
  }

  private readSigil(): void {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.col;
    this.pos++; // skip @
    this.col++;

    if (this.pos >= this.source.length) {
      throw new LexError("Unexpected end of file after @", this.makeSpan(start, this.pos, startLine, startCol));
    }

    const ch = this.peek();
    if (ch === "{" || ch === "*" || ch === "}") {
      this.addTokenSpan("LITERAL", "@", start, startLine, startCol);
      return;
    }

    let trimStart = false;
    if (ch === "-") {
      trimStart = true;
      this.pos++;
      this.col++;
    }

    const name = this.readIdentifier();
    if (name === "") {
      throw new LexError("Unknown sigil starting with @", this.makeSpan(start, this.pos, startLine, startCol));
    }

    // Handle @else if (two words, single token)
    if (name === "else" && this.startsWith(" if")) {
      const endPos = this.pos + 3;
      if (endPos >= this.source.length || !/[a-zA-Z0-9_]/.test(this.source[endPos] ?? "")) {
        this.pos += 3;
        this.col += 3;
        this.addTokenSpan("ELSE_IF", "@else if", start, startLine, startCol);
        return;
      }
    }

    if (trimStart) {
      const trimType = TRIM_KEYWORDS[name];
      if (trimType) {
        this.addTokenSpan(trimType, `@-${name}`, start, startLine, startCol);
        return;
      }
      throw new LexError(`@-${name} is not a valid trim sigil`, this.makeSpan(start, this.pos, startLine, startCol));
    }

    // Check for suffix trim marker (@keyword-)
    let trimSuffix = false;
    if (this.peek() === "-") {
      trimSuffix = true;
      this.pos++;
      this.col++;
    }

    const keywordType = KEYWORDS[name];
    if (keywordType) {
      if (trimSuffix) {
        const trimType = TRIM_KEYWORDS[name];
        if (trimType) {
          this.addTokenSpan(trimType, `@${name}-`, start, startLine, startCol);
          return;
        }
      }
      this.addTokenSpan(keywordType, `@${name}`, start, startLine, startCol);
    } else {
      throw new LexError(`Unknown sigil @${name}`, this.makeSpan(start, this.pos, startLine, startCol));
    }
  }

  private readIdentifier(): string {
    let name = "";
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (/[a-zA-Z0-9_]/.test(ch)) {
        name += ch;
        this.pos++;
        this.col++;
      } else {
        break;
      }
    }
    return name;
  }

  private readInterpolation(): void {
    let depth = 1;
    while (this.pos < this.source.length) {
      if (this.match("{{")) depth++;
      else if (this.match("-}}")) {
        depth--;
        if (depth === 0) {
          this.addToken("INTERP_CLOSE_TRIM", "-}}");
          return;
        }
      }
      else if (this.match("}}")) {
        depth--;
        if (depth === 0) {
          this.addToken("INTERP_CLOSE", "}}");
          return;
        }
      }
      else if (this.peek() === "\n") {
        throw new LexError("Unclosed {{ interpolation", this.makeSpan(this.pos, this.pos + 2, this.line, this.col));
      }
      else {
        this.pos++;
        this.col++;
      }
    }
    throw new LexError("Unclosed {{ interpolation", this.makeSpan(this.pos, this.pos, this.line, this.col));
  }

  private readLiteral(): void {
    const start = this.pos;
    const startLine = this.line;
    const startCol = this.col;
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (this.startsWith("@*") || this.startsWith("{{-") || this.startsWith("{{") || this.startsWith("-@if")) break;
      if (ch === "@") {
        const next = this.pos + 1 < this.source.length ? this.source[this.pos + 1] : "";
        if (next && /[a-zA-Z_-]/.test(next)) break;
      }
      if (/[a-zA-Z0-9_"]/.test(ch)) break;
      if ("{}()<>,:?|!;=-.".indexOf(ch) !== -1 || this.startsWith("||") || this.startsWith("&&") || this.startsWith("...")) break;
      if (ch === "\n") { this.line++; this.col = 1; }
      else { this.col++; }
      this.pos++;
    }
    const value = this.source.slice(start, this.pos);
    if (value.length > 0) {
      this.addTokenSpan("LITERAL", value, start, startLine, startCol);
    }
  }

  private readWord(): string {
    let word = "";
    while (this.pos < this.source.length && /[a-zA-Z0-9_]/.test(this.peek())) {
      word += this.peek();
      this.pos++;
      this.col++;
    }
    return word;
  }

  private readNumber(): string {
    let num = "";
    while (this.pos < this.source.length && /[0-9.]/.test(this.peek())) {
      num += this.peek();
      this.pos++;
      this.col++;
    }
    return num;
  }

  private readString(): string {
    let str = "";
    this.pos++; // skip opening "
    this.col++;
    while (this.pos < this.source.length) {
      if (this.peek() === "\\") {
        str += this.peek();
        this.pos++;
        this.col++;
        if (this.pos < this.source.length) {
          str += this.peek();
          this.pos++;
          this.col++;
        }
        continue;
      }
      if (this.peek() === '"') {
        this.pos++;
        this.col++;
        return str;
      }

      str += this.peek();
      this.pos++;
      this.col++;
    }
    return str;
  }

  private startsWith(s: string): boolean {
    if (this.pos + s.length > this.source.length) return false;
    for (let i = 0; i < s.length; i++) {
      if (this.source[this.pos + i] !== s[i]) return false;
    }
    return true;
  }

  private match(s: string): boolean {
    if (this.pos + s.length > this.source.length) return false;
    for (let i = 0; i < s.length; i++) {
      if (this.source[this.pos + i] !== s[i]) return false;
    }
    this.pos += s.length;
    this.col += s.length;
    return true;
  }

  private peek(): string {
    return this.source[this.pos] ?? "";
  }

  private addToken(type: TokenType, value: string): void {
    const span: Span = { start: this.pos, end: this.pos + value.length, line: this.line, col: this.col };
    this.tokens.push(token(type, value, span));
  }

  private addTokenSpan(type: TokenType, value: string, start: number, startLine: number, startCol: number): void {
    this.tokens.push(token(type, value, {
      start,
      end: this.pos,
      line: startLine,
      col: startCol,
    }));
  }

  private makeSpan(start: number, end: number, line: number, col: number): Span {
    return { start, end, line, col };
  }
}

export class LexError extends StncilError {
  constructor(message: string, public readonly span: Span) {
    super(message);
    this.name = "StncilLexError";
  }
}
