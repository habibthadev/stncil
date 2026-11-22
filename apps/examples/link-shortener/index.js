import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "stncil";
import { randomInt } from "node:crypto";
import {
  csrfToken,
  HttpError,
  normalizeDestination,
  parseForm,
  requestUrl,
  sendHtml,
  sendError,
} from "../shared/http.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Static file serving ---
const PUBLIC = path.join(__dirname, "public");
const ASSETS = new Map(
  ["main.css", "app.js"].map((name) => [
    `/${name}`,
    {
      content: fs.readFileSync(path.join(PUBLIC, name)),
      type: name.endsWith(".css") ? "text/css" : "application/javascript",
    },
  ]),
);

function serveStatic(req, res, pathname) {
  const asset = ASSETS.get(pathname);
  if (!asset || !["GET", "HEAD"].includes(req.method)) return false;
  res.writeHead(200, {
    "Content-Type": asset.type,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=3600",
  });
  res.end(req.method === "HEAD" ? undefined : asset.content);
  return true;
}

// --- Template ---
function readTemplate(name) {
  return fs.readFileSync(path.join(__dirname, "views", name), "utf-8");
}

const engine = new Engine({ debug: false, csrfToken });

async function renderPage(template, context) {
  const src = readTemplate(template);
  const result = await engine.compileAndRender(src, context, {
    sourceFile: path.join(__dirname, "views", template),
  });
  if (result.errors.length > 0) throw result.errors[0];
  const layoutSrc = readTemplate("layout.stn");
  const layoutResult = await engine.compileAndRender(
    layoutSrc,
    { ...context, content: result.html, csrf_token: csrfToken, year: new Date().getFullYear() },
    { sourceFile: path.join(__dirname, "views/layout.stn") },
  );
  if (layoutResult.errors.length > 0) throw layoutResult.errors[0];
  return layoutResult.html;
}

// --- Store ---
let nextId = 6;
let links = [
  {
    id: "1",
    slug: "gh-actions",
    url: "https://docs.github.com/en/actions",
    title: "GitHub Actions Docs",
    clicks: 142,
    createdAt: new Date("2026-06-10"),
  },
  {
    id: "2",
    slug: "mdn-array",
    url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array",
    title: "MDN Array Reference",
    clicks: 89,
    createdAt: new Date("2026-06-12"),
  },
  {
    id: "3",
    slug: "node-install",
    url: "https://nodejs.org/en/download/package-manager",
    title: "Node.js Download Guide",
    clicks: 234,
    createdAt: new Date("2026-06-14"),
  },
  {
    id: "4",
    slug: "pnpm-ws",
    url: "https://pnpm.io/workspaces",
    title: "pnpm Workspaces Docs",
    clicks: 56,
    createdAt: new Date("2026-06-16"),
  },
  {
    id: "5",
    slug: "stncil",
    url: "https://github.com/habibthadev/stncil",
    title: "Stncil Template Engine",
    clicks: 12,
    createdAt: new Date("2026-06-18"),
  },
];

function generateSlug() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let slug;
  do {
    slug = "";
    for (let i = 0; i < 8; i++) slug += chars[randomInt(chars.length)];
  } while (links.some((l) => l.slug === slug));
  return slug;
}

function slugExists(slug, excludeId) {
  return links.some((l) => l.slug === slug && l.id !== excludeId);
}

// --- Server ---
const server = http.createServer(async (req, res) => {
  try {
    const url = requestUrl(req);
    const { pathname } = url;
    const method = req.method;
    if (serveStatic(req, res, pathname)) return;
    const body = method === "POST" ? await parseForm(req) : null;

    // Dashboard
    if (method === "GET" && pathname === "/") {
      const totalClicks = links.reduce((s, l) => s + l.clicks, 0);
      const html = await renderPage("index.stn", {
        title: "Links",
        description: "URL shortener dashboard.",
        links,
        counts: {
          total: links.length,
          clicks: totalClicks,
          avg: links.length ? Math.round(totalClicks / links.length) : 0,
        },
        message: url.searchParams.get("message") || null,
      });
      sendHtml(res, 200, html);

      // Create
    } else if (method === "POST" && pathname === "/links") {
      let { url: target, slug, title } = body;
      if (!target || !target.trim()) {
        res.writeHead(302, { Location: "/?message=URL+is+required" });
        res.end();
        return;
      }
      target = normalizeDestination(target);
      slug = (slug || "").trim().toLowerCase() || generateSlug();
      if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
        res.writeHead(303, { Location: "/?message=Use+up+to+64+letters%2C+numbers%2C+or+hyphens" });
        res.end();
        return;
      }
      if (slugExists(slug)) {
        res.writeHead(302, {
          Location: `/?message=Slug+%22${encodeURIComponent(slug)}%22+already+taken`,
        });
        res.end();
        return;
      }
      if ((title || "").trim().length > 240)
        throw new HttpError(400, "Labels must be at most 240 characters");
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
      const link = links.find((l) => l.id === id);
      const html = await renderPage("edit.stn", {
        title: link ? `Edit: ${link.title}` : "Not Found",
        description: link ? `Editing link: ${link.title}` : "Link not found.",
        link: link || null,
        message: url.searchParams.get("message") || null,
      });
      sendHtml(res, link ? 200 : 404, html);

      // Update
    } else if (method === "POST" && /^\/links\/\d+\/update$/.test(pathname)) {
      const id = pathname.match(/^\/links\/(\d+)\/update$/)[1];
      const link = links.find((l) => l.id === id);
      if (link) {
        let { url: target, title } = body;
        if (!target || !target.trim()) {
          res.writeHead(302, { Location: `/links/${id}/edit?message=URL+is+required` });
          res.end();
          return;
        }
        target = normalizeDestination(target);
        if ((title || "").trim().length > 240)
          throw new HttpError(400, "Labels must be at most 240 characters");
        link.url = target;
        link.title = (title || "").trim() || target;
      } else throw new HttpError(404, "Link not found");
      res.writeHead(302, { Location: "/" });
      res.end();

      // Delete
    } else if (method === "POST" && /^\/links\/\d+\/delete$/.test(pathname)) {
      const id = pathname.match(/^\/links\/(\d+)\/delete$/)[1];
      if (!links.some((link) => link.id === id)) throw new HttpError(404, "Link not found");
      links = links.filter((l) => l.id !== id);
      res.writeHead(302, { Location: "/" });
      res.end();

      // Redirect catch-all (must be last)
    } else if (method === "GET" && /^\/[a-z0-9-]+$/i.test(pathname)) {
      const slug = pathname.slice(1);
      const link = links.find((l) => l.slug === slug);
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
        sendHtml(res, 404, html);
      }
    } else {
      const html = await renderPage("index.stn", {
        title: "Not Found",
        description: "Page not found.",
        links: [],
        counts: { total: 0, clicks: 0, avg: 0 },
        message: "Page not found.",
      });
      sendHtml(res, 404, html);
    }
  } catch (err) {
    sendError(res, err);
  }
});

const PORT = Number(process.env.PORT ?? 3002);
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Link shortener running at http://localhost:${server.address().port}/`);
});
