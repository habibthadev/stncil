import { Span } from "../error";

export type OutputMode = "html" | "text" | "xml";

export type AstNode =
  | TemplateNode
  | OutputModeNode
  | ContextDeclNode
  | LiteralNode
  | InterpNode
  | IfNode
  | EachNode
  | AsyncBlockNode
  | LetNode
  | CacheBlockNode
  | BoundaryNode
  | LayoutNode
  | SlotDefNode
  | ImportNode
  | RenderNode
  | RecursiveDefNode
  | RecursiveCallNode
  | HeadPushNode
  | HeadTitleNode
  | HeadMetaNode
  | HeadCanonicalNode
  | HeadJsonLdNode
  | StyleBlockNode
  | StylesTargetNode
  | ScriptBlockNode
  | ScriptsTargetNode
  | HeadTargetNode
  | CsrfNode
  | AssetNode
  | JsonNode
  | NonceRefNode
  | DebugNode
  | TranslateNode
  | FilterChainNode;

export interface BaseNode {
  readonly span: Span;
}

export interface TemplateNode extends BaseNode {
  readonly kind: "template";
  readonly nodes: AstNode[];
}

export interface OutputModeNode extends BaseNode {
  readonly kind: "output_mode";
  readonly mode: OutputMode;
}

export interface ContextDeclNode extends BaseNode {
  readonly kind: "context_decl";
  readonly fields: ContextFieldNode[];
}

export interface ContextFieldNode {
  readonly name: string;
  readonly typeExpr: TypeExprNode;
  readonly optional: boolean;
  readonly span: Span;
}

export type TypeExprNode =
  | { kind: "string" }
  | { kind: "number" }
  | { kind: "boolean" }
  | { kind: "date" }
  | { kind: "null" }
  | { kind: "array"; item: TypeExprNode }
  | { kind: "record"; value: TypeExprNode }
  | { kind: "object"; fields: ContextFieldNode[] }
  | { kind: "union"; variants: TypeExprNode[] }
  | { kind: "named"; name: string };

export interface LiteralNode extends BaseNode {
  readonly kind: "literal";
  readonly value: string;
}

export interface InterpNode extends BaseNode {
  readonly kind: "interp";
  readonly expr: ExprNode;
  readonly trimStart: boolean;
  readonly trimEnd: boolean;
  readonly raw?: boolean;
  readonly escapeContext?: "html" | "url" | "js" | "css" | "xml";
}

export type ExprNode =
  | PathExprNode
  | StringExprNode
  | NumberExprNode
  | BooleanExprNode
  | NullExprNode
  | BinaryExprNode
  | UnaryExprNode
  | TernaryExprNode
  | FilterChainNode
  | { readonly kind: "array"; readonly items: ExprNode[]; readonly span: Span }
  | { readonly kind: "object"; readonly fields: { name: string; value: ExprNode }[]; readonly span: Span }
  | { readonly kind: "index"; readonly object: ExprNode; readonly key: ExprNode; readonly span: Span };

export interface PathExprNode {
  readonly kind: "path";
  readonly segments: readonly string[];
  readonly span: Span;
}

export interface StringExprNode {
  readonly kind: "string";
  readonly value: string;
  readonly span: Span;
}

export interface NumberExprNode {
  readonly kind: "number";
  readonly value: number;
  readonly span: Span;
}

export interface BooleanExprNode {
  readonly kind: "boolean";
  readonly value: boolean;
  readonly span: Span;
}

export interface NullExprNode {
  readonly kind: "null";
  readonly span: Span;
}

export interface BinaryExprNode {
  readonly kind: "binary";
  readonly op: BinaryOp;
  readonly left: ExprNode;
  readonly right: ExprNode;
  readonly span: Span;
}

export interface UnaryExprNode {
  readonly kind: "unary";
  readonly op: "!" | "-";
  readonly operand: ExprNode;
  readonly span: Span;
}

export interface TernaryExprNode {
  readonly kind: "ternary";
  readonly condition: ExprNode;
  readonly consequent: ExprNode;
  readonly alternate: ExprNode;
  readonly span: Span;
}

export type BinaryOp = "==" | "!=" | "<" | ">" | "<=" | ">=" | "&&" | "||" | "+" | "-" | "*" | "/" | "%" | "~";

export interface IfNode extends BaseNode {
  readonly kind: "if";
  readonly condition: ExprNode;
  readonly consequent: AstNode[];
  readonly elseIfs: { condition: ExprNode; body: AstNode[] }[];
  readonly alternate: AstNode[] | null;
  readonly trimStart: boolean;
  readonly trimEnd: boolean;
}

export interface EachNode extends BaseNode {
  readonly kind: "each";
  readonly itemName: string;
  readonly indexName: string | null;
  readonly source: ExprNode;
  readonly body: AstNode[];
  readonly empty: AstNode[];
}

export interface AsyncBlockNode extends BaseNode {
  readonly kind: "async_block";
  readonly binding: string;
  readonly fetcher: string;
  readonly args: ExprNode[];
  readonly body: AstNode[];
  readonly loading: AstNode[];
  readonly errorBinding: string | null;
  readonly error: AstNode[];
}

export interface LetNode extends BaseNode {
  readonly kind: "let";
  readonly name: string;
  readonly value: ExprNode;
  readonly spread?: boolean;
}

export interface CacheBlockNode extends BaseNode {
  readonly kind: "cache_block";
  readonly keyParts: CacheKeyPart[];
  readonly ttl: number;
  readonly body: AstNode[];
}

export type CacheKeyPart =
  | { kind: "literal"; value: string }
  | { kind: "expr"; expr: ExprNode };

export interface BoundaryNode extends BaseNode {
  readonly kind: "boundary";
  readonly body: AstNode[];
  readonly errorBinding: string | null;
  readonly fallback: AstNode[];
}

export interface LayoutNode extends BaseNode {
  readonly kind: "layout";
  readonly path: string;
  readonly slots: SlotContentNode[];
}

export interface SlotContentNode {
  readonly name: string;
  readonly body: AstNode[];
  readonly span: Span;
}

export interface SlotDefNode extends BaseNode {
  readonly kind: "slot_def";
  readonly name: string;
  readonly defaultBody: AstNode[] | null;
}

export interface ImportNode extends BaseNode {
  readonly kind: "import";
  readonly names: string[];
  readonly path: string;
}

export interface RenderNode extends BaseNode {
  readonly kind: "render";
  readonly name: string;
  readonly props: RenderProp[];
}

export type RenderProp =
  | { kind: "named"; name: string; value: ExprNode }
  | { kind: "spread"; name: string; span: Span };

export interface RecursiveDefNode extends BaseNode {
  readonly kind: "recursive_def";
  readonly name: string;
  readonly param: string;
  readonly body: AstNode[];
}

export interface RecursiveCallNode extends BaseNode {
  readonly kind: "recursive_call";
  readonly name: string;
  readonly arg: ExprNode;
}

export interface HeadPushNode extends BaseNode {
  readonly kind: "head_push";
  readonly contributions: HeadContributionNode[];
}

export type HeadContributionNode =
  | HeadTitleNode
  | HeadMetaNode
  | HeadCanonicalNode
  | HeadJsonLdNode;

export interface HeadTitleNode extends BaseNode {
  readonly kind: "head_title";
  readonly content: AstNode[];
}

export interface HeadMetaNode extends BaseNode {
  readonly kind: "head_meta";
  readonly attributes: Record<string, ExprNode>;
}

export interface HeadCanonicalNode extends BaseNode {
  readonly kind: "head_canonical";
  readonly url: ExprNode;
}

export interface HeadJsonLdNode extends BaseNode {
  readonly kind: "head_jsonld";
  readonly content: AstNode[];
}

export interface StyleBlockNode extends BaseNode {
  readonly kind: "style_block";
  readonly css: string;
  readonly critical: boolean;
}

export interface StylesTargetNode extends BaseNode {
  readonly kind: "styles_target";
}

export interface ScriptBlockNode extends BaseNode {
  readonly kind: "script_block";
  readonly scriptType: "defer" | "async" | "module" | "inline";
  readonly attrType: string | null;
  readonly content: AstNode[];
}

export interface ScriptsTargetNode extends BaseNode {
  readonly kind: "scripts_target";
}

export interface HeadTargetNode extends BaseNode {
  readonly kind: "head_target";
}

export interface CsrfNode extends BaseNode {
  readonly kind: "csrf";
}

export interface AssetNode extends BaseNode {
  readonly kind: "asset";
  readonly path: string;
}

export interface JsonNode extends BaseNode {
  readonly kind: "json";
  readonly expr: ExprNode;
}

export interface NonceRefNode extends BaseNode {
  readonly kind: "nonce_ref";
}

export interface DebugNode extends BaseNode {
  readonly kind: "debug";
  readonly path: string[] | null;
}

export interface TranslateNode extends BaseNode {
  readonly kind: "translate";
  readonly key: string;
  readonly args: Record<string, ExprNode>;
}

export interface FilterChainNode extends BaseNode {
  readonly kind: "filter_chain";
  readonly expr: ExprNode;
  readonly filters: FilterNode[];
}

export interface FilterNode {
  readonly name: string;
  readonly args: ExprNode[];
  readonly span: Span;
}
