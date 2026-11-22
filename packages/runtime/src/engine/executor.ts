import type {
  IrInstruction,
  IrDocument,
  IrExpr,
  WriteLiteralInstruction,
  WriteEscapedInstruction,
  WriteUrlEscapedInstruction,
  WriteCssEscapedInstruction,
  WriteTrustedInstruction,
  WriteFilterInstruction,
  WriteJsonInstruction,
  IfInstruction,
  EachInstruction,
  LetInstruction,
  BoundaryInstruction,
  CacheBlockInstruction,
  RecursiveDefInstruction,
  RecursiveCallInstruction,
  StyleBlockInstruction,
} from "@stncil/core";
import { resolvePath, type RenderContext } from "./context";
import { evalExpr } from "./eval";
import { escapeHtml } from "../escape/html";
import { escapeUrl } from "../escape/url";
import { escapeCss } from "../escape/css";
import { resolveFilter, type FilterFn } from "../filters/index";
import { escapeJs } from "../escape/js";
import { validateUrl } from "../escape/url";

export interface OutputOptions {
  readonly csrfToken?: string;
  readonly nonce?: string;
  readonly assetManifest?: Readonly<Record<string, string>>;
  readonly filters?: Readonly<Record<string, FilterFn>>;
}

export interface ExecutorState {
  output: string;
  options: OutputOptions;
  variables: Record<string, unknown>;
  recursiveDefs: Map<string, { param: string; body: readonly IrInstruction[]; maxDepth: number }>;
  depth: Map<string, number>;
}

export function createExecutorState(options: OutputOptions = {}): ExecutorState {
  return {
    output: "",
    options,
    variables: Object.create(null),
    recursiveDefs: new Map(),
    depth: new Map(),
  };
}

export function exec(
  instructions: readonly IrInstruction[],
  ctx: RenderContext,
  state: ExecutorState,
): void {
  execBlock(instructions, ctx, state, true);
}

function execBlock(
  instructions: readonly IrInstruction[],
  ctx: RenderContext,
  state: ExecutorState,
  snapshot = false,
): void {
  const locals = instructions.some((instruction) => instruction.op === "LET");
  const scope = snapshot || locals ? { ...ctx } : ctx;
  const parent = state.variables;
  if (locals) state.variables = Object.create(null);
  try {
    for (const inst of instructions) execOne(inst, scope, state);
  } finally {
    if (locals) state.variables = parent;
  }
}

export function execOne(inst: IrInstruction, ctx: RenderContext, state: ExecutorState): void {
  switch (inst.op) {
    case "WRITE_LITERAL":
      state.output += (inst as WriteLiteralInstruction).value;
      break;

    case "WRITE_EXPRESSION": {
      const value = evalExpr(inst.expr, ctx, state.options.filters);
      state.output +=
        inst.escape === "raw" ? (value == null ? "" : String(value)) : escapeHtml(value);
      break;
    }

    case "WRITE_ESCAPED": {
      const val = resolvePath((inst as WriteEscapedInstruction).path, ctx);
      state.output += escapeHtml(val);
      break;
    }

    case "WRITE_URL_ESCAPED": {
      const val = resolvePath((inst as WriteUrlEscapedInstruction).path, ctx);
      state.output += escapeUrl(val);
      break;
    }

    case "WRITE_CSS_ESCAPED": {
      const val = resolvePath((inst as WriteCssEscapedInstruction).path, ctx);
      state.output += escapeCss(val);
      break;
    }

    case "WRITE_TRUSTED": {
      const val = resolvePath((inst as WriteTrustedInstruction).path, ctx);
      state.output += val == null ? "" : String(val);
      break;
    }

    case "WRITE_FILTER": {
      const fi = inst as WriteFilterInstruction;
      let val: unknown = resolvePath(fi.path, ctx);
      for (const f of fi.filters) {
        const fn = resolveFilter(f.name, state.options.filters);
        const args = f.args.map((a: IrExpr) => evalExpr(a, ctx, state.options.filters));
        val = fn(val, ...args);
      }
      state.output += val == null ? "" : escapeHtml(val);
      break;
    }

    case "WRITE_JSON": {
      const ji = inst as WriteJsonInstruction;
      const val = ji.expr
        ? evalExpr(ji.expr, ctx, state.options.filters)
        : resolvePath(ji.path, ctx);
      state.output += escapeJs(val);
      break;
    }

    case "WRITE_NONCE":
      if (!state.options.nonce) throw new Error("CSP nonce is not provided");
      state.output += escapeHtml(state.options.nonce);
      break;

    case "WRITE_ASSET":
      if (state.options.assetManifest && !Object.hasOwn(state.options.assetManifest, inst.path))
        throw new Error(`Asset "${inst.path}" is not in the manifest`);
      state.output += escapeHtml(
        validateUrl(state.options.assetManifest?.[inst.path] ?? inst.path),
      );
      break;

    case "IF": {
      const ii = inst as IfInstruction;
      const cond = evalExpr(ii.condition, ctx, state.options.filters);
      if (cond) {
        execBlock(ii.consequent, ctx, state);
      } else {
        let matched = false;
        for (const ei of ii.elseIfs) {
          if (evalExpr(ei.condition, ctx, state.options.filters)) {
            execBlock(ei.body, ctx, state);
            matched = true;
            break;
          }
        }
        if (!matched && ii.alternate) {
          execBlock(ii.alternate, ctx, state);
        }
      }
      break;
    }

    case "EACH": {
      const ei = inst as EachInstruction;
      const source = evalExpr(ei.source, ctx, state.options.filters);
      const arr = Array.isArray(source) ? source : [];
      if (arr.length === 0) {
        execBlock(ei.empty, ctx, state);
      } else {
        for (let i = 0; i < arr.length; i++) {
          const loopCtx: RenderContext = {
            ...ctx,
            loop: {
              index: i + 1,
              index0: i,
              first: i === 0,
              last: i === arr.length - 1,
              length: arr.length,
              revindex: arr.length - i,
              revindex0: arr.length - i - 1,
              parent: ctx.loop ?? null,
            },
            [ei.as]: arr[i],
          };
          if (ei.indexAs) {
            Object.defineProperty(loopCtx, ei.indexAs, {
              value: i,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          }
          execBlock(ei.body, loopCtx, state);
        }
      }
      break;
    }

    case "LET": {
      const li = inst as LetInstruction;
      state.variables[li.name] = evalExpr(li.value, ctx, state.options.filters);
      Object.defineProperty(ctx, li.name, {
        value: state.variables[li.name],
        writable: true,
        enumerable: true,
        configurable: true,
      });
      break;
    }

    case "CACHE_BLOCK": {
      const ci = inst as CacheBlockInstruction;
      execBlock(ci.body, ctx, state);
      break;
    }

    case "BOUNDARY": {
      const bi = inst as BoundaryInstruction;
      const output = state.output;
      try {
        execBlock(bi.body, ctx, state);
      } catch (err) {
        state.output = output;
        if (bi.errorBinding) {
          const errCtx: RenderContext = { ...ctx, [bi.errorBinding]: err };
          execBlock(bi.fallback, errCtx, state);
        } else {
          execBlock(bi.fallback, ctx, state);
        }
      }
      break;
    }

    case "RECURSIVE_DEF": {
      const rdi = inst as RecursiveDefInstruction;
      state.recursiveDefs.set(rdi.name, {
        param: rdi.param,
        body: rdi.body,
        maxDepth: rdi.maxDepth,
      });
      break;
    }

    case "RECURSIVE_CALL": {
      const rci = inst as RecursiveCallInstruction;
      const def = state.recursiveDefs.get(rci.name);
      if (def) {
        const curDepth = state.depth.get(rci.name) ?? 0;
        if (curDepth >= def.maxDepth) return;
        state.depth.set(rci.name, curDepth + 1);
        try {
          const arg = evalExpr(rci.arg, ctx, state.options.filters);
          const callCtx: RenderContext = { ...ctx, [def.param]: arg };
          execBlock(def.body, callCtx, state);
        } finally {
          state.depth.set(rci.name, curDepth);
        }
      }
      break;
    }

    case "STYLE_BLOCK": {
      const si = inst as StyleBlockInstruction;
      state.output += `<style>${si.css}</style>`;
      break;
    }
    case "SCRIPT_BLOCK": {
      state.output += "";
      break;
    }
    case "HEAD_PUSH":
    case "STYLES_TARGET":
    case "SCRIPTS_TARGET":
    case "DEBUG":
    case "TRANSLATE":
      break;
    case "CSRF":
      if (!state.options.csrfToken) throw new Error("CSRF token is not provided");
      state.output += `<input type="hidden" name="_csrf" value="${escapeHtml(state.options.csrfToken)}">`;
      break;
    case "ASYNC_BLOCK":
    case "PARALLEL_GROUP":
      throw new Error("Async templates require renderAsync() or renderStream()");
    case "LAYOUT":
    case "RENDER_PARTIAL":
    case "SLOT_TARGET":
      throw new Error("Template composition requires renderAsync() or renderStream()");
  }
}
