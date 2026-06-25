export type OutputMode = "html" | "text" | "xml";

export interface IrDocument {
  readonly stncilVersion: 1;
  readonly outputMode: OutputMode;
  readonly sourceFile: string;
  readonly sourceHash: string;
  readonly compiledAt: string;
  readonly scopeHash: string;
  readonly context: Record<string, IrType>;
  readonly translationsManifest: readonly string[];
  readonly fetchersManifest: readonly FetcherManifestEntry[];
  readonly sourceMap: SourceMap;
  readonly instructions: readonly IrInstruction[];
}

export interface FetcherManifestEntry {
  readonly name: string;
  readonly argTypes: readonly IrType[];
}

export interface SourceMap {
  readonly nodes: Record<string, SourceLocation>;
}

export interface SourceLocation {
  readonly line: number;
  readonly col: number;
}

export type IrType =
  | { readonly kind: "string" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "date" }
  | { readonly kind: "null" }
  | { readonly kind: "object"; readonly fields: Record<string, IrType> }
  | { readonly kind: "record"; readonly value: IrType }
  | { readonly kind: "array"; readonly item: IrType }
  | { readonly kind: "union"; readonly variants: readonly IrType[] }
  | { readonly kind: "nullable"; readonly inner: IrType }
  | { readonly kind: "optional"; readonly inner: IrType }
  | { readonly kind: "trusted_html" }
  | { readonly kind: "trusted_js" }
  | { readonly kind: "trusted_css" }
  | { readonly kind: "trusted_url" };

export type IrInstruction =
  | WriteLiteralInstruction
  | WriteEscapedInstruction
  | WriteUrlEscapedInstruction
  | WriteJsEscapedInstruction
  | WriteCssEscapedInstruction
  | WriteTrustedInstruction
  | WriteFilterInstruction
  | WriteJsonInstruction
  | WriteNonceInstruction
  | WriteAssetInstruction
  | IfInstruction
  | EachInstruction
  | LetInstruction
  | AsyncBlockInstruction
  | ParallelGroupInstruction
  | CacheBlockInstruction
  | BoundaryInstruction
  | HeadPushInstruction
  | StyleBlockInstruction
  | StylesTargetInstruction
  | ScriptBlockInstruction
  | ScriptsTargetInstruction
  | HeadTargetInstruction
  | CsrfInstruction
  | RenderPartialInstruction
  | SlotTargetInstruction
  | RecursiveDefInstruction
  | RecursiveCallInstruction
  | TranslateInstruction
  | DebugInstruction;

export interface BaseInstruction {
  readonly nodeId: string;
}

export interface WriteLiteralInstruction extends BaseInstruction {
  readonly op: "WRITE_LITERAL";
  readonly value: string;
}

export interface WriteEscapedInstruction extends BaseInstruction {
  readonly op: "WRITE_ESCAPED";
  readonly path: readonly string[];
}

export interface WriteUrlEscapedInstruction extends BaseInstruction {
  readonly op: "WRITE_URL_ESCAPED";
  readonly path: readonly string[];
}

export interface WriteJsEscapedInstruction extends BaseInstruction {
  readonly op: "WRITE_JS_ESCAPED";
  readonly path: readonly string[];
}

export interface WriteCssEscapedInstruction extends BaseInstruction {
  readonly op: "WRITE_CSS_ESCAPED";
  readonly path: readonly string[];
}

export interface WriteTrustedInstruction extends BaseInstruction {
  readonly op: "WRITE_TRUSTED";
  readonly path: readonly string[];
}

export interface WriteFilterInstruction extends BaseInstruction {
  readonly op: "WRITE_FILTER";
  readonly path: readonly string[];
  readonly filters: readonly IrFilter[];
}

export interface WriteJsonInstruction extends BaseInstruction {
  readonly op: "WRITE_JSON";
  readonly path: readonly string[];
}

export interface WriteNonceInstruction extends BaseInstruction {
  readonly op: "WRITE_NONCE";
}

export interface WriteAssetInstruction extends BaseInstruction {
  readonly op: "WRITE_ASSET";
  readonly path: string;
}

export interface IrFilter {
  readonly name: string;
  readonly args: readonly IrExpr[];
}

export interface IfInstruction extends BaseInstruction {
  readonly op: "IF";
  readonly condition: IrExpr;
  readonly consequent: readonly IrInstruction[];
  readonly elseIfs: readonly { condition: IrExpr; body: readonly IrInstruction[] }[];
  readonly alternate: readonly IrInstruction[] | null;
}

export interface EachInstruction extends BaseInstruction {
  readonly op: "EACH";
  readonly source: IrExpr;
  readonly as: string;
  readonly indexAs: string | null;
  readonly body: readonly IrInstruction[];
  readonly empty: readonly IrInstruction[];
}

export interface LetInstruction extends BaseInstruction {
  readonly op: "LET";
  readonly name: string;
  readonly value: IrExpr;
}

export interface AsyncBlockInstruction extends BaseInstruction {
  readonly op: "ASYNC_BLOCK";
  readonly parallelGroup: string | null;
  readonly binding: string;
  readonly fetcher: string;
  readonly args: readonly IrExpr[];
  readonly body: readonly IrInstruction[];
  readonly loading: readonly IrInstruction[];
  readonly errorBinding: string | null;
  readonly error: readonly IrInstruction[];
}

export interface ParallelGroupInstruction extends BaseInstruction {
  readonly op: "PARALLEL_GROUP";
  readonly id: string;
  readonly blocks: readonly AsyncBlockInstruction[];
}

export interface CacheBlockInstruction extends BaseInstruction {
  readonly op: "CACHE_BLOCK";
  readonly keyParts: readonly IrCacheKeyPart[];
  readonly ttl: number;
  readonly body: readonly IrInstruction[];
}

export type IrCacheKeyPart =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "expr"; readonly expr: IrExpr };

export interface BoundaryInstruction extends BaseInstruction {
  readonly op: "BOUNDARY";
  readonly body: readonly IrInstruction[];
  readonly errorBinding: string | null;
  readonly fallback: readonly IrInstruction[];
}

export interface HeadPushInstruction extends BaseInstruction {
  readonly op: "HEAD_PUSH";
  readonly contributions: readonly HeadContribution[];
}

export type HeadContribution =
  | { kind: "title"; instructions: readonly IrInstruction[] }
  | { kind: "meta"; attributes: Record<string, IrExpr> }
  | { kind: "canonical"; url: IrExpr }
  | { kind: "jsonld"; instructions: readonly IrInstruction[] };

export interface StyleBlockInstruction extends BaseInstruction {
  readonly op: "STYLE_BLOCK";
  readonly scopeHash: string;
  readonly css: string;
  readonly critical: boolean;
}

export interface StylesTargetInstruction extends BaseInstruction {
  readonly op: "STYLES_TARGET";
}

export interface ScriptBlockInstruction extends BaseInstruction {
  readonly op: "SCRIPT_BLOCK";
  readonly content: readonly IrInstruction[];
  readonly scriptType: "defer" | "async" | "module" | "inline";
  readonly contentHash: string;
}

export interface ScriptsTargetInstruction extends BaseInstruction {
  readonly op: "SCRIPTS_TARGET";
}

export interface HeadTargetInstruction extends BaseInstruction {
  readonly op: "HEAD_TARGET";
}

export interface CsrfInstruction extends BaseInstruction {
  readonly op: "CSRF";
}

export interface RenderPartialInstruction extends BaseInstruction {
  readonly op: "RENDER_PARTIAL";
  readonly template: string;
  readonly props: Record<string, IrExpr>;
}

export interface SlotTargetInstruction extends BaseInstruction {
  readonly op: "SLOT_TARGET";
  readonly name: string;
  readonly defaultBody: readonly IrInstruction[] | null;
}

export interface RecursiveDefInstruction extends BaseInstruction {
  readonly op: "RECURSIVE_DEF";
  readonly name: string;
  readonly param: string;
  readonly body: readonly IrInstruction[];
  readonly maxDepth: number;
}

export interface RecursiveCallInstruction extends BaseInstruction {
  readonly op: "RECURSIVE_CALL";
  readonly name: string;
  readonly arg: IrExpr;
}

export interface TranslateInstruction extends BaseInstruction {
  readonly op: "TRANSLATE";
  readonly key: string;
  readonly args: Record<string, IrExpr>;
}

export interface DebugInstruction extends BaseInstruction {
  readonly op: "DEBUG";
  readonly path: readonly string[] | null;
}

export type IrExpr =
  | { kind: "path"; segments: readonly string[] }
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "binary"; op: IrBinaryOp; left: IrExpr; right: IrExpr }
  | { kind: "unary"; op: IrUnaryOp; operand: IrExpr }
  | { kind: "ternary"; condition: IrExpr; consequent: IrExpr; alternate: IrExpr };

export type IrBinaryOp = "==" | "!=" | "<" | ">" | "<=" | ">=" | "&&" | "||";
export type IrUnaryOp = "!";
