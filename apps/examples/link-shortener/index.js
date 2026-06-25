import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "stncil";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Static file serving ---
const PUBLIC = path.join(__dirname, "public");
const MIME = { ".css": "text/css", ".js": "application/javascript" };

function serveStatic(req, res) {
  const filePath = path.join(PUBLIC, req.url === "/" ? "index.html" : req.url);
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); res.end();
    return true;
  }
  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
    return true;
  } catch { return false; }
}

// --- Template ---
function readTemplate(name) {
  return fs.readFileSync(path.join(__dirname, "views", name), "utf-8");
}

const engine = new Engine({ debug: false });

async function renderPage(template, context) {
  const src = readTemplate(template);
  const result = await engine.compileAndRender(src, context);
  if (result.errors.length > 0) console.error("Template errors:", result.errors);
  const layoutSrc = readTemplate("layout.stn");
  const layoutResult = await engine.compileAndRender(layoutSrc, { ...context, content: result.html, year: new Date().getFullYear() });
  return layoutResult.html;
}

// --- Body parser ---
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => resolve(Object.fromEntries(new URLSearchParams(body))));
    req.on("error", reject);
  });
}

// --- Store ---
let nextId = 6;
let links = [
  { id: "1", slug: "gh-actions", url: "https://docs.github.com/en/actions", title: "GitHub Actions Docs", clicks: 142, createdAt: new Date("2026-06-10") },
  { id: "2", slug: "mdn-array", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array", title: "MDN Array Reference", clicks: 89, createdAt: new Date("2026-06-12") },
  { id: "3", slug: "node-install", url: "https://nodejs.org/en/download/package-manager", title: "Node.js Download Guide", clicks: 234, createdAt: new Date("2026-06-14") },
  { id: "4", slug: "pnpm-ws", url: "https://pnpm.io/workspaces", title: "pnpm Workspaces Docs", clicks: 56, createdAt: new Date("2026-06-16") },
  { id: "5", slug: "stncil", url: "https://github.com/habibthadev/stncil", title: "Stncil Template Engine", clicks: 12, createdAt: new Date("2026-06-18") },
];

function generateSlug() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let slug;
  do {
    slug = "";
    for (let i = 0; i < 5; i++) slug += chars[Math.floor(Math.random() * chars.length)];
  } while (links.some(l => l.slug === slug));
  return slug;
}

function slugExists(slug, excludeId) {
  return links.some(l => l.slug === slug && l.id !== excludeId);
}

// --- Server ---
const server = http.createServer(async (req, res) => {
  try {
    if (serveStatic(req, res)) return;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;
    const method = req.method;

    // Dashboard
    if (method === "GET" && pathname === "/") {
      const totalClicks = links.reduce((s, l) => s + l.clicks, 0);
      const html = await renderPage("index.stn", {
        title: "Links",
        description: "URL shortener dashboard.",
        links,
        counts: { total: links.length, clicks: totalClicks, avg: links.length ? Math.round(totalClicks / links.length) : 0 },
        message: url.searchParams.get("message") || null,
      });
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);

    // Create
    } else if (method === "POST" && pathname === "/links") {
      const body = await parseBody(req);
      let { url: target, slug, title } = body;
      if (!target || !target.trim()) {
        res.writeHead(302, { Location: "/?message=URL+is+required" });
        res.end(); return;
      }
      target = target.trim();
      if (!/^https?:\/\//i.test(target)) target = "https://" + target;
      slug = (slug || "").trim().toLowerCase() || generateSlug();
      if (!/^[a-z0-9-]+$/.test(slug)) {
        res.writeHead(302, { Location: "/?message=Slug+must+be+alphanumeric" });
        res.end(); return;
      }
      if (slugExists(slug)) {
        res.writeHead(302, { Location: `/?message=Slug+%22${encodeURIComponent(slug)}%22+already+taken` });
        res.end(); return;
      }
      links.unshift({
        id: String(nextId++),
        slug,
        url: target,
        title: (title || "").trim() || target,
        clicks: 0,
        createdAt: new Date(),
      });
      res.writeHead(302, { Location: "/" });
      res.end();

    // Edit form
    } else if (method === "GET" && /^\/links\/\d+\/edit$/.test(pathname)) {
      const id = pathname.match(/^\/links\/(\d+)\/edit$/)[1];
      const link = links.find(l => l.id === id);
      const html = await renderPage("edit.stn", {
        title: link ? `Edit: ${link.title}` : "Not Found",
        description: link ? `Editing link: ${link.title}` : "Link not found.",
        link: link || null,
        message: url.searchParams.get("message") || null,
      });
      res.writeHead(link ? 200 : 404, { "Content-Type": "text/html" });
      res.end(html);

    // Update
    } else if (method === "POST" && /^\/links\/\d+\/update$/.test(pathname)) {
      const id = pathname.match(/^\/links\/(\d+)\/update$/)[1];
      const link = links.find(l => l.id === id);
      if (link) {
        const body = await parseBody(req);
        let { url: target, title } = body;
        if (!target || !target.trim()) {
          res.writeHead(302, { Location: `/links/${id}/edit?message=URL+is+required` });
          res.end(); return;
        }
        target = target.trim();
        if (!/^https?:\/\//i.test(target)) target = "https://" + target;
        link.url = target;
        link.title = (title || "").trim() || target;
      }
      res.writeHead(302, { Location: "/" });
      res.end();

    // Delete
    } else if (method === "POST" && /^\/links\/\d+\/delete$/.test(pathname)) {
      const id = pathname.match(/^\/links\/(\d+)\/delete$/)[1];
      links = links.filter(l => l.id !== id);
      res.writeHead(302, { Location: "/" });
      res.end();

    // Redirect catch-all (must be last)
    } else if (method === "GET" && /^\/[a-z0-9-]+$/i.test(pathname)) {
      const slug = pathname.slice(1);
      const link = links.find(l => l.slug === slug);
      if (link) {
        link.clicks++;
        res.writeHead(302, { Location: link.url });
        res.end();
      } else {
        const html = await renderPage("index.stn", {
          title: "Not Found",
          description: "Short link not found.",
          links: [],
          counts: { total: 0, clicks: 0, avg: 0 },
          message: `Short link "${slug}" not found.`,
        });
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end(html);
      }

    } else {
      const html = await renderPage("index.stn", {
        title: "Not Found",
        description: "Page not found.",
        links: [],
        counts: { total: 0, clicks: 0, avg: 0 },
        message: "Page not found.",
      });
      res.writeHead(404, { "Content-Type": "text/html" });
      res.end(html);
    }
  } catch (err) {
    console.error("Server error:", err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Link shortener running at http://localhost:${PORT}/`);
});
