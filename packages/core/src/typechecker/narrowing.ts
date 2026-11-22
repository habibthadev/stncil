import { ExprNode } from "../parser/ast";
import { IrType } from "./types";
import { Scope } from "./scope";

export function narrowType(condition: ExprNode, scope: Scope, isConsequent: boolean): Scope {
  if (condition.kind === "binary" && condition.op === "!=") {
    const narrowed = isConsequent ? narrowRightNull(condition.left, condition.right, scope) : null;
    if (narrowed) return narrowed;
  }
  if (condition.kind === "binary" && condition.op === "==") {
    const narrowed = isConsequent ? null : narrowRightNull(condition.left, condition.right, scope);
    if (narrowed) return narrowed;
  }
  if (condition.kind === "binary" && condition.op === "&&") {
    const leftNarrowed = narrowType(condition.left, scope, isConsequent);
    return narrowType(condition.right, leftNarrowed, isConsequent);
  }
  if (condition.kind === "binary" && condition.op === "||") {
    if (!isConsequent) {
      const leftNarrowed = narrowType(condition.left, scope, false);
      return narrowType(condition.right, leftNarrowed, false);
    }
  }
  if (condition.kind === "unary" && condition.op === "!") {
    return narrowType(condition.operand, scope, !isConsequent);
  }
  return scope;
}

function narrowRightNull(left: ExprNode, right: ExprNode, scope: Scope): Scope | null {
  if (right.kind !== "null") return null;
  if (left.kind !== "path") return null;
  return narrowPath(left.segments, scope);
}

function narrowPath(segments: readonly string[], scope: Scope): Scope {
  const newScope = scope.clone();
  if (segments.length === 1) {
    const entry = scope.lookup(segments[0]!);
    if (entry && (isNullable(entry.type) || isOptional(entry.type))) {
      const inner =
        entry.type.kind === "nullable"
          ? ((entry.type as any).inner as IrType)
          : entry.type.kind === "optional"
            ? ((entry.type as any).inner as IrType)
            : entry.type;
      newScope.declare(segments[0]!, inner, entry.source);
    }
  } else if (segments.length > 1) {
    const rootName = segments[0]!;
    const rootEntry = scope.lookup(rootName);
    if (rootEntry) {
      const narrowedRoot = narrowNestedField(rootEntry.type, segments.slice(1));
      if (narrowedRoot) {
        newScope.declare(rootName, narrowedRoot, rootEntry.source);
      }
    }
  }
  return newScope;
}

function narrowNestedField(type: IrType, path: readonly string[]): IrType | null {
  if (path.length === 0) return type;
  if (type.kind === "object") {
    const field = type.fields[path[0]!];
    if (!field) return null;
    const narrowed = narrowNestedField(field, path.slice(1));
    if (!narrowed) return null;
    return { ...type, fields: { ...type.fields, [path[0]!]: narrowed } };
  }
  if (type.kind === "nullable" || type.kind === "optional") {
    const inner = narrowNestedField(type.inner, path);
    if (inner) return inner;
  }
  return null;
}

export function isNullable(type: IrType): boolean {
  return (
    type.kind === "nullable" ||
    (type.kind === "union" && type.variants.some((v) => v.kind === "null"))
  );
}

export function isOptional(type: IrType): boolean {
  return type.kind === "optional";
}
