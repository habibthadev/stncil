export function escapeUrl(value: unknown): string {
  if (value == null) return "";
  return encodeURIComponent(String(value))
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A")
    .replace(/%20/g, "+");
}

export function validateUrl(value: unknown): string {
  if (value == null) return "";
  const url = String(value).trim();
  const parsed = new URL(url, "https://stncil.invalid");
  if (!["https:", "http:", "mailto:", "tel:"].includes(parsed.protocol)) {
    throw new TypeError("Unsafe URL scheme");
  }
  return url;
}
