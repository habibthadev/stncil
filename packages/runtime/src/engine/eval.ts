import type { IrExpr } from "@stncil/core";
import { resolvePath, resolveMember, type RenderContext } from "./context";
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
      return expr.op === "-" ? -arithmeticNumber(evalExpr(expr.operand, ctx)) : !evalExpr(expr.operand, ctx);
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
    case "array":
      return expr.items.map(item => evalExpr(item, ctx));
    case "object":
      return Object.fromEntries(expr.fields.map(field => [field.name, evalExpr(field.value, ctx)]));
    case "index":
      return resolveMember(evalExpr(expr.object, ctx), evalExpr(expr.key, ctx));
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
    case "~": return String(left ?? "") + String(right ?? "");
    case "+": case "-": case "*": case "/": case "%": {
      const a = arithmeticNumber(left);
      const b = arithmeticNumber(right);
      if ((op === "/" || op === "%") && b === 0) throw new RangeError("Division by zero");
      const result = op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : op === "/" ? a / b : a % b;
      if (!Number.isFinite(result)) throw new RangeError("Arithmetic result must be finite");
      return result;
    }
    default: return undefined;
  }
}

function arithmeticNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Arithmetic requires finite numbers");
  }
  return value;
}
