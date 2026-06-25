import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "stncil";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readTemplate(name) {
  return fs.readFileSync(path.join(__dirname, name), "utf-8");
}

const engine = new Engine({ debug: false });
const startedAt = new Date();

const posts = [
  {
    title: "Getting Started with Stncil",
    excerpt: "Learn how to use Stncil to build type-safe templates.",
    author: "Alice",
    date: new Date("2026-06-20"),
  },
  {
    title: "Filters and Expressions",
    excerpt: "Stncil supports filter chains, ternary operators, and more.",
    author: "Bob",
    date: new Date("2026-06-22"),
  },
  {
    title: "Streaming Templates",
    excerpt: "Render large templates efficiently with WHATWG ReadableStream.",
    author: "Charlie",
    date: new Date("2026-06-24"),
  },
];

const greetings = [
  "Hope you're having a great day!",
  "Welcome to the Stncil demo.",
  "Nice to see you!",
  "Hello there!",
];

async function renderPage(templateName, context) {
  const source = readTemplate(templateName);
  const contentResult = await engine.compileAndRender(source, context);
  if (contentResult.errors.length > 0) {
    console.error("Template errors:", contentResult.errors);
  }
  const layoutSource = readTemplate("views/layout.stn");
  const layoutResult = await engine.compileAndRender(layoutSource, {
    ...context,
    content: contentResult.html,
    year: startedAt.getFullYear(),
  });
  return layoutResult.html;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname === "/" || pathname === "") {
      const html = await renderPage("views/index.stn", {
        title: "Home",
        description: "A demo site built with Stncil.",
        tagline: "A typed, streaming template engine for TypeScript.",
        is_home: true,
        posts,
        started_at: startedAt,
      });
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);

    } else if (pathname === "/hello") {
      const name = url.searchParams.get("name") || "World";
      const greeting = greetings[Math.floor(Math.random() * greetings.length)];
      const html = await renderPage("views/hello.stn", {
        title: `Hello, ${name}`,
        description: `A personalized greeting for ${name}.`,
        is_greeting: true,
        name,
        greeting,
        method: req.method,
        url: req.url,
        now: new Date(),
      });
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);

    } else {
      const html = await renderPage("views/not-found.stn", {
        title: "404 Not Found",
        description: "Page not found.",
        path: pathname,
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log("Try:");
  console.log("  http://localhost:3000/");
  console.log('  http://localhost:3000/hello?name=Stncil');
});
