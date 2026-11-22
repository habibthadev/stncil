import type {
  IrInstruction, IrDocument, IrExpr,
  WriteLiteralInstruction, WriteEscapedInstruction,
  WriteUrlEscapedInstruction, WriteCssEscapedInstruction,
  WriteTrustedInstruction, WriteFilterInstruction, WriteJsonInstruction,
  IfInstruction, EachInstruction, LetInstruction,
  BoundaryInstruction, CacheBlockInstruction,
  RecursiveDefInstruction, RecursiveCallInstruction,
  StyleBlockInstruction,
} from "@stncil/core";
import { resolvePath, type RenderContext } from "./context";
import { evalExpr } from "./eval";
import { escapeHtml } from "../escape/html";
import { escapeUrl } from "../escape/url";
import { escapeCss } from "../escape/css";
import { getFilter } from "../filters/index";

export interface ExecutorState {
  output: string;
  variables: Record<string, unknown>;
  recursiveDefs: Map<string, { param: string; body: readonly IrInstruction[]; maxDepth: number }>;
  depth: Map<string, number>;
}

export function createExecutorState(): ExecutorState {
  return {
    output: "",
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
  const parent = state.variables;
  const scope: RenderContext = Object.assign(Object.create(null), ctx);
  state.variables = Object.create(null);
  try {
    for (const inst of instructions) {
      execOne(inst, scope, state);
    }
  } finally {
    state.variables = parent;
  }
}

function execOne(inst: IrInstruction, ctx: RenderContext, state: ExecutorState): void {
  switch (inst.op) {
    case "WRITE_LITERAL":
      state.output += (inst as WriteLiteralInstruction).value;
      break;

    case "WRITE_EXPRESSION": {
      const value = evalExpr(inst.expr, ctx);
      state.output += inst.escape === "raw" ? (value == null ? "" : String(value)) : escapeHtml(value);
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
        const args = f.args.map((a: IrExpr) => evalExpr(a, ctx));
        const fn = getFilter(f.name);
        if (fn) val = fn(val, ...args);
      }
      state.output += val == null ? "" : escapeHtml(val);
      break;
    }

    case "WRITE_JSON": {
      const ji = inst as WriteJsonInstruction;
      const val = resolvePath(ji.path, ctx);
      state.output += JSON.stringify(val);
      break;
    }

    case "WRITE_NONCE":
      state.output += "";
      break;

    case "WRITE_ASSET":
      state.output += "";
      break;

    case "IF": {
      const ii = inst as IfInstruction;
      const cond = evalExpr(ii.condition, ctx);
      if (cond) {
        exec(ii.consequent, ctx, state);
      } else {
        let matched = false;
        for (const ei of ii.elseIfs) {
          if (evalExpr(ei.condition, ctx)) {
            exec(ei.body, ctx, state);
            matched = true;
            break;
          }
        }
        if (!matched && ii.alternate) {
          exec(ii.alternate, ctx, state);
        }
      }
      break;
    }

    case "EACH": {
      const ei = inst as EachInstruction;
      const source = evalExpr(ei.source, ctx);
      const arr = Array.isArray(source) ? source : [];
      if (arr.length === 0) {
        exec(ei.empty, ctx, state);
      } else {
        for (let i = 0; i < arr.length; i++) {
          const loopCtx: RenderContext = {
            ...ctx,
            loop: { index: i + 1, index0: i, first: i === 0, last: i === arr.length - 1,
              length: arr.length, revindex: arr.length - i, revindex0: arr.length - i - 1,
              parent: ctx.loop ?? null },
            [ei.as]: arr[i],
          };
          if (ei.indexAs) {
            loopCtx[ei.indexAs] = i;
          }
          exec(ei.body, loopCtx, state);
        }
      }
      break;
    }

    case "LET": {
      const li = inst as LetInstruction;
      state.variables[li.name] = evalExpr(li.value, ctx);
      ctx[li.name] = state.variables[li.name];
      break;
    }

    case "CACHE_BLOCK": {
      const ci = inst as CacheBlockInstruction;
      exec(ci.body, ctx, state);
      break;
    }

    case "BOUNDARY": {
      const bi = inst as BoundaryInstruction;
      const output = state.output;
      try {
        exec(bi.body, ctx, state);
      } catch (err) {
        state.output = output;
        if (bi.errorBinding) {
          const errCtx: RenderContext = { ...ctx, [bi.errorBinding]: err };
          exec(bi.fallback, errCtx, state);
        } else {
          exec(bi.fallback, ctx, state);
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
          const arg = evalExpr(rci.arg, ctx);
          const callCtx: RenderContext = { ...ctx, [def.param]: arg };
          exec(def.body, callCtx, state);
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
    case "CSRF":
    case "DEBUG":
    case "TRANSLATE":
    case "RENDER_PARTIAL":
    case "SLOT_TARGET":
      break;
  }
}
