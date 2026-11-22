export interface RenderContext {
  [key: string]: unknown;
}

export function resolvePath(segments: readonly string[], ctx: RenderContext): unknown {
  let current: unknown = ctx;
  for (const seg of segments) {
    current = resolveMember(current, seg);
  }
  return current;
}

export function resolveMember(value: unknown, key: unknown): unknown {
  if (value == null || typeof value !== "object") return undefined;
  if (typeof key !== "string" && typeof key !== "number") return undefined;
  if (!Object.hasOwn(value, key)) return undefined;
  return (value as Record<string, unknown>)[key];
}
