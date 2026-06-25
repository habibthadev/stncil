export interface Span {
  readonly start: number;
  readonly end: number;
  readonly line: number;
  readonly col: number;
}

export interface SourceLocation {
  readonly line: number;
  readonly col: number;
}

export interface TypeCheckError {
  readonly code: string;
  readonly message: string;
  readonly hint?: string;
  readonly span: Span;
  readonly sourceFile: string;
}

export interface CompileWarning {
  readonly code: string;
  readonly message: string;
  readonly span: Span;
}

export class StncilError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StncilError";
  }
}

export class CompileError extends Error {
  readonly errors: readonly TypeCheckError[];

  constructor(errors: readonly TypeCheckError[]) {
    const msg = errors.map((e) => `[${e.code}] ${e.message} (${e.sourceFile}:${e.span.line}:${e.span.col})`).join("\n");
    super(msg);
    this.name = "StncilCompileError";
    this.errors = errors;
  }
}

export function formatError(err: TypeCheckError, source: string): string {
  const lines = source.split("\n");
  const line = lines[err.span.line - 1];
  const prefix = `StncilError [${err.code}]: ${err.message}`;
  const location = `  File: ${err.sourceFile}, Line ${err.span.line}, Col ${err.span.col}`;
  const sourceLine = line ? `\n\n  ${err.span.line} | ${line}` : "";
  const underline = line
    ? `\n    ${" ".repeat(String(err.span.line).length)} | ${" ".repeat(err.span.col - 1)}${"^".repeat(Math.max(1, err.span.end - err.span.start))}`
    : "";
  const hint = err.hint ? `\n\n  ${err.hint}` : "";
  return `${prefix}\n${location}${sourceLine}${underline}${hint}`;
}
