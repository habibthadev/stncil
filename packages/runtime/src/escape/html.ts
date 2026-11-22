const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_RE = /[&<>"']/g;
const HTML_UNSAFE_RE = /[&<>"']/;

function replacement(character: string): string {
  return HTML_ESCAPE_MAP[character]!;
}

export function escapeHtml(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  return HTML_UNSAFE_RE.test(str) ? str.replace(HTML_ESCAPE_RE, replacement) : str;
}
