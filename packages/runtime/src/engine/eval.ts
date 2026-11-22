import type { IrExpr } from "@stncil/core";
import { resolvePath, resolveMember, type RenderContext } from "./context";
import { resolveFilter, type FilterFn } from "../filters";

export function evalExpr(
  expr: IrExpr,
  ctx: RenderContext,
  filters?: Readonly<Record<string, FilterFn>>,
): unknown {
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
      const left = evalExpr(expr.left, ctx, filters);
      if (expr.op === "&&") return Boolean(left) && Boolean(evalExpr(expr.right, ctx, filters));
      if (expr.op === "||") return Boolean(left) || Boolean(evalExpr(expr.right, ctx, filters));
      return evalBinary(expr.op, left, evalExpr(expr.right, ctx, filters));
    }
    case "unary":
      return expr.op === "-"
        ? -arithmeticNumber(evalExpr(expr.operand, ctx, filters))
        : !evalExpr(expr.operand, ctx, filters);
    case "ternary":
      return evalExpr(expr.condition, ctx, filters)
        ? evalExpr(expr.consequent, ctx, filters)
        : evalExpr(expr.alternate, ctx, filters);
    case "filter_chain": {
      let value = evalExpr(expr.expr, ctx, filters);
      for (const f of expr.filters) {
        const fn = resolveFilter(f.name, filters);
        const args = f.args.map((a: IrExpr) => evalExpr(a, ctx, filters));
        value = fn(value, ...args);
      }
      return value;
    }
    case "array":
      return expr.items.map((item) => evalExpr(item, ctx, filters));
    case "object":
      return Object.fromEntries(
        expr.fields.map((field) => [field.name, evalExpr(field.value, ctx, filters)]),
      );
    case "index":
      return resolveMember(evalExpr(expr.object, ctx, filters), evalExpr(expr.key, ctx, filters));
  }
}

export function evalBinary(op: string, left: unknown, right: unknown): unknown {
  switch (op) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return (left as number) < (right as number);
    case ">":
      return (left as number) > (right as number);
    case "<=":
      return (left as number) <= (right as number);
    case ">=":
      return (left as number) >= (right as number);
    case "~":
      return String(left ?? "") + String(right ?? "");
    case "+":
    case "-":
    case "*":
    case "/":
    case "%": {
      const a = arithmeticNumber(left);
      const b = arithmeticNumber(right);
      if ((op === "/" || op === "%") && b === 0) throw new RangeError("Division by zero");
      const result =
        op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : op === "/" ? a / b : a % b;
      if (!Number.isFinite(result)) throw new RangeError("Arithmetic result must be finite");
      return result;
    }
    default:
      return undefined;
  }
}

export function arithmeticNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Arithmetic requires finite numbers");
  }
  return value;
}
