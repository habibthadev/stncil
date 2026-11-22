const JSON_ESCAPES: Readonly<Record<string, string>> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function escapeJs(value: unknown): string {
  return (JSON.stringify(value) ?? "null").replace(
    /[<>&\u2028\u2029]/g,
    (character) => JSON_ESCAPES[character]!,
  );
}
