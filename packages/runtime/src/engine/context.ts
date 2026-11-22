export interface RenderContext {
  [key: string]: unknown;
}

export function resolvePath(segments: readonly string[], ctx: RenderContext): unknown {
  let current: unknown = ctx;
  for (const seg of segments) {
    if (current == null || typeof current !== "object" || !Object.hasOwn(current, seg)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[seg];
  }
  return current;
}
