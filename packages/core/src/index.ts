import { Lexer } from "./lexer/index";
import { Token } from "./lexer/token";
import { Parser } from "./parser/index";
import { TypeChecker } from "./typechecker/index";
import { TypeCheckResult } from "./typechecker/index";
import { Emitter } from "./codegen/emitter";
import { generateTypeDefinition } from "./typegen/typescript";
import { IrDocument } from "./codegen/ir";
import { CompileError, CompileWarning, TypeCheckError, StncilError } from "./error";
import { OutputMode } from "./parser/ast";

export interface CompileOptions {
  readonly sourceFile: string;
  readonly source?: string;
  readonly strict?: boolean;
  readonly debug?: boolean;
  readonly maxRecursionDepth?: number;
  readonly assetManifest?: Record<string, string>;
}

export interface CompileResult {
  readonly ir: IrDocument;
  readonly typeDefinition: string;
  readonly warnings: readonly CompileWarning[];
}

export {
  IrDocument,
  IrInstruction,
  IrExpr,
  OutputMode,
  IrType,
  WriteLiteralInstruction,
  WriteExpressionInstruction,
  WriteEscapedInstruction,
  WriteUrlEscapedInstruction,
  WriteJsEscapedInstruction,
  WriteCssEscapedInstruction,
  WriteTrustedInstruction,
  WriteFilterInstruction,
  WriteJsonInstruction,
  WriteNonceInstruction,
  WriteAssetInstruction,
  IfInstruction,
  EachInstruction,
  LetInstruction,
  AsyncBlockInstruction,
  ParallelGroupInstruction,
  CacheBlockInstruction,
  BoundaryInstruction,
  HeadPushInstruction,
  StyleBlockInstruction,
  StylesTargetInstruction,
  ScriptBlockInstruction,
  ScriptsTargetInstruction,
  HeadTargetInstruction,
  CsrfInstruction,
  RenderPartialInstruction,
  LayoutInstruction,
  SlotTargetInstruction,
  RecursiveDefInstruction,
  RecursiveCallInstruction,
  TranslateInstruction,
  DebugInstruction,
  IrFilter,
  IrBinaryOp,
  IrUnaryOp,
  IrCacheKeyPart,
  SourceMap,
  SourceLocation,
} from "./codegen/ir";
export { Token } from "./lexer/token";
export {
  CompileError,
  CompileWarning,
  TypeCheckError,
  StncilError,
  formatError,
  Span,
} from "./error";
export { TypeCheckResult } from "./typechecker/index";
export { Scope } from "./typechecker/scope";
export { generateTypeDefinition } from "./typegen/typescript";
export { generateScopeHash } from "./codegen/scope-hash";

export async function compile(options: CompileOptions): Promise<CompileResult> {
  const { sourceFile, source, strict = false, debug = true, assetManifest } = options;

  if (typeof source !== "string") {
    throw new StncilError("Source string is required for compilation");
  }

  // Stage 1: Lex
  const lexer = new Lexer(source);
  let tokens: Token[];
  try {
    tokens = lexer.tokenize();
  } catch (err) {
    if (err instanceof StncilError) {
      throw new CompileError([
        {
          code: "LEX_ERROR",
          message: err.message,
          span: (err as any).span ?? { start: 0, end: 0, line: 1, col: 1 },
          sourceFile,
        },
      ]);
    }
    throw err;
  }

  // Stage 2: Parse
  const parser = new Parser(tokens);
  let ast;
  try {
    ast = parser.parse();
  } catch (err) {
    if (err instanceof StncilError) {
      throw new CompileError([
        {
          code: "PARSE_ERROR",
          message: err.message,
          span: (err as any).span ?? { start: 0, end: 0, line: 1, col: 1 },
          sourceFile,
        },
      ]);
    }
    throw err;
  }

  // Compute source hash
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(source));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const sourceHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  // Stage 3: Type check
  const checker = new TypeChecker(sourceFile, strict, debug, assetManifest);
  const checkResult: TypeCheckResult = checker.check(ast.nodes);

  if (checkResult.errors.length > 0 && strict) {
    throw new CompileError(checkResult.errors);
  }

  // Stage 4: Codegen
  const emitter = new Emitter(
    sourceFile,
    sourceHash,
    checkResult.outputMode,
    checkResult.context,
    debug,
  );
  const ir = await emitter.emit(ast.nodes);

  // Stage 5: Typegen
  const typeDefinition = generateTypeDefinition(ir);

  const warnings: CompileWarning[] = [
    ...checkResult.warnings.map((w) => ({
      code: w.code,
      message: w.message,
      span: w.span,
    })),
    ...checkResult.errors.map((e) => ({
      code: e.code,
      message: e.message,
      span: e.span,
    })),
  ];

  if (checkResult.errors.length > 0 && !strict) {
    // Non-strict mode: report as warnings
  }

  return { ir, typeDefinition, warnings };
}
