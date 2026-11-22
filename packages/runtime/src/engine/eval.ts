import type { IrExpr } from "@stncil/core";
import { resolvePath, type RenderContext } from "./context";
import { getFilter } from "../filters";

export function evalExpr(expr: IrExpr, ctx: RenderContext): unknown {
  switch (expr.kind) {
    case "path":
      return resolvePath(expr.segments, ctx);
    case "string":
      return expr.value;
    case "number":
      return expr.value;
    case "boolean":
      return expr.value;
    case "null":
      return null;
    case "binary": {
      const left = evalExpr(expr.left, ctx);
      if (expr.op === "&&") return Boolean(left) && Boolean(evalExpr(expr.right, ctx));
      if (expr.op === "||") return Boolean(left) || Boolean(evalExpr(expr.right, ctx));
      return evalBinary(expr.op, left, evalExpr(expr.right, ctx));
    }
    case "unary":
      return !evalExpr(expr.operand, ctx);
    case "ternary":
      return evalExpr(expr.condition, ctx)
        ? evalExpr(expr.consequent, ctx)
        : evalExpr(expr.alternate, ctx);
    case "filter_chain": {
      let value = evalExpr(expr.expr, ctx);
      for (const f of expr.filters) {
        const fn = getFilter(f.name);
        if (fn) {
          const args = f.args.map((a: IrExpr) => evalExpr(a, ctx));
          value = fn(value, ...args);
        }
      }
      return value;
    }
  }
}

function evalBinary(op: string, left: unknown, right: unknown): unknown {
  switch (op) {
    case "==": return left === right;
    case "!=": return left !== right;
    case "<": return (left as number) < (right as number);
    case ">": return (left as number) > (right as number);
    case "<=": return (left as number) <= (right as number);
    case ">=": return (left as number) >= (right as number);
    default: return undefined;
  }
}
