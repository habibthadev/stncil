import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";

const assets = new Map([
  [
    "/tasks.js",
    {
      content: readFileSync(new URL("./tasks.js", import.meta.url)),
      type: "application/javascript",
    },
  ],
  [
    "/icons.svg",
    { content: readFileSync(new URL("./icons.svg", import.meta.url)), type: "image/svg+xml" },
  ],
  [
    "/design.css",
    { content: readFileSync(new URL("./design.css", import.meta.url)), type: "text/css" },
  ],
]);

export function serveSharedAsset(request, response, pathname) {
  const asset = assets.get(pathname);
  if (!asset || !["GET", "HEAD"].includes(request.method)) return false;
  response.writeHead(200, {
    "Content-Type": asset.type,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=3600",
  });
  response.end(request.method === "HEAD" ? undefined : asset.content);
  return true;
}

export const csrfToken = randomBytes(32).toString("hex");

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requestUrl(request) {
  const host = request.headers.host ?? "";
  const match = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d{1,5}))?$/i.exec(host);
  if (!match || (match[2] && Number(match[2]) > 65535)) {
    throw new HttpError(400, "Invalid request host");
  }
  try {
    return new URL(request.url ?? "/", "http://localhost");
  } catch {
    throw new HttpError(400, "Invalid request URL");
  }
}

export async function parseForm(request, limit = 16_384) {
  if (
    (request.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase() !==
    "application/x-www-form-urlencoded"
  ) {
    request.resume();
    throw new HttpError(415, "Use a URL-encoded form");
  }
  const body = await new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    let failed = false;
    request.on("data", (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true;
        chunks = [];
        reject(new HttpError(413, "Form is too large"));
      } else chunks.push(chunk);
    });
    request.on("end", () => {
      if (!failed) {
        try {
          resolve(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
        } catch {
          reject(new HttpError(400, "Form must contain valid UTF-8"));
        }
      }
    });
    request.on("error", reject);
    request.on("aborted", () => reject(new HttpError(400, "Form submission was interrupted")));
  });
  try {
    decodeURIComponent(body.replace(/\+/g, " "));
  } catch {
    throw new HttpError(400, "Invalid form encoding");
  }
  const fields = Object.create(null);
  for (const [name, value] of new URLSearchParams(body)) {
    if (Object.hasOwn(fields, name)) throw new HttpError(400, "Duplicate form field");
    fields[name] = value;
  }
  const provided = Buffer.from(fields._csrf ?? "");
  const expected = Buffer.from(csrfToken);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new HttpError(403, "Invalid form token; reload the page and try again");
  }
  return fields;
}

export function normalizeDestination(value) {
  const input = String(value ?? "").trim();
  if (!input || input.length > 2048 || /[\u0000-\u001f\u007f]/.test(input)) {
    throw new HttpError(400, "Enter a valid destination URL");
  }
  let parsed;
  try {
    parsed = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
  } catch {
    throw new HttpError(400, "Enter a valid destination URL");
  }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new HttpError(400, "Use an HTTP or HTTPS URL without credentials");
  }
  return parsed.href;
}

export function sendHtml(response, status, html) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  });
  response.end(html);
}

export function sendError(response, error) {
  if (response.destroyed || response.headersSent) return;
  const expected = error instanceof HttpError;
  if (!expected) console.error("Server error:", error);
  response.writeHead(expected ? error.status : 500, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(expected ? error.message : "Internal Server Error");
}
