import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "stncil";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readTemplate(name) {
  return fs.readFileSync(path.join(__dirname, "views", name), "utf-8");
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const params = new URLSearchParams(body);
      resolve(Object.fromEntries(params));
    });
    req.on("error", reject);
  });
}

let nextId = 6;
let todos = [
  { id: "1", title: "Design the dashboard layout", completed: true, createdAt: new Date("2026-06-18") },
  { id: "2", title: "Implement user authentication flow", completed: false, createdAt: new Date("2026-06-19") },
  { id: "3", title: "Write API documentation for v2 endpoints", completed: false, createdAt: new Date("2026-06-21") },
  { id: "4", title: "Fix responsive grid on product cards", completed: false, createdAt: new Date("2026-06-23") },
  { id: "5", title: "Review PR #47 — streaming optimizations", completed: true, createdAt: new Date("2026-06-24") },
];

const engine = new Engine({ debug: false });

async function renderPage(template, context) {
  const src = readTemplate(template);
  const result = await engine.compileAndRender(src, context);
  if (result.errors.length > 0) {
    console.error("Template errors:", result.errors);
  }
  const layoutSrc = readTemplate("layout.stn");
  const layoutResult = await engine.compileAndRender(layoutSrc, {
    ...context,
    content: result.html,
    year: new Date().getFullYear(),
  });
  return layoutResult.html;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { pathname } = url;
    const method = req.method;

    if (method === "GET" && pathname === "/") {
      const filter = url.searchParams.get("filter") || "all";
      const filtered = filter === "active"
        ? todos.filter(t => !t.completed)
        : filter === "completed"
        ? todos.filter(t => t.completed)
        : todos;
      const html = await renderPage("index.stn", {
        title: "Tasks",
        description: "A simple task manager built with Stncil.",
        todos: filtered,
        counts: {
          all: todos.length,
          active: todos.filter(t => !t.completed).length,
          completed: todos.filter(t => t.completed).length,
        },
        currentFilter: filter,
        message: url.searchParams.get("message") || null,
      });
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);

    } else if (method === "POST" && pathname === "/todos") {
      const body = await parseBody(req);
      const title = body.title?.trim();
      if (!title) {
        res.writeHead(302, { Location: "/?message=Title+is+required" });
        res.end();
        return;
      }
      todos.unshift({
        id: String(nextId++),
        title,
        completed: false,
        createdAt: new Date(),
      });
      res.writeHead(302, { Location: "/" });
      res.end();

    } else if (method === "POST" && /^\/todos\/\d+\/toggle$/.test(pathname)) {
      const id = pathname.match(/^\/todos\/(\d+)\/toggle$/)[1];
      const todo = todos.find(t => t.id === id);
      if (todo) { todo.completed = !todo.completed; }
      res.writeHead(302, { Location: "/" });
      res.end();

    } else if (method === "GET" && /^\/todos\/\d+\/edit$/.test(pathname)) {
      const id = pathname.match(/^\/todos\/(\d+)\/edit$/)[1];
      const todo = todos.find(t => t.id === id);
      const html = await renderPage("edit.stn", {
        title: todo ? `Edit: ${todo.title}` : "Not Found",
        description: todo ? `Editing task: ${todo.title}` : "Task not found.",
        todo: todo || null,
      });
      res.writeHead(todo ? 200 : 404, { "Content-Type": "text/html" });
      res.end(html);

    } else if (method === "POST" && /^\/todos\/\d+\/update$/.test(pathname)) {
      const id = pathname.match(/^\/todos\/(\d+)\/update$/)[1];
      const todo = todos.find(t => t.id === id);
      if (todo) {
        const body = await parseBody(req);
        const title = body.title?.trim();
        if (title) { todo.title = title; }
      }
      res.writeHead(302, { Location: "/" });
      res.end();

    } else if (method === "POST" && /^\/todos\/\d+\/delete$/.test(pathname)) {
      const id = pathname.match(/^\/todos\/(\d+)\/delete$/)[1];
      todos = todos.filter(t => t.id !== id);
      res.writeHead(302, { Location: "/" });
      res.end();

    } else {
      const html = await renderPage("index.stn", {
        title: "Not Found",
        description: "Page not found.",
        todos: [],
        counts: { all: 0, active: 0, completed: 0 },
        currentFilter: "all",
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Todo app running at http://localhost:${PORT}/`);
});
