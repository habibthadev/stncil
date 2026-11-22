import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Engine } from "stncil";
import {
  csrfToken,
  HttpError,
  parseForm,
  requestUrl,
  serveSharedAsset,
  sendHtml,
  sendError,
} from "../shared/http.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readTemplate(name) {
  return fs.readFileSync(path.join(__dirname, "views", name), "utf-8");
}

let nextId = 6;
let todos = [
  {
    id: "1",
    title: "Design the dashboard layout",
    completed: true,
    createdAt: new Date("2026-06-18"),
  },
  {
    id: "2",
    title: "Implement user authentication flow",
    completed: false,
    createdAt: new Date("2026-06-19"),
  },
  {
    id: "3",
    title: "Write API documentation for v2 endpoints",
    completed: false,
    createdAt: new Date("2026-06-21"),
  },
  {
    id: "4",
    title: "Fix responsive grid on product cards",
    completed: false,
    createdAt: new Date("2026-06-23"),
  },
  {
    id: "5",
    title: "Review PR #47 — streaming optimizations",
    completed: true,
    createdAt: new Date("2026-06-24"),
  },
];

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
    {
      ...context,
      content: result.html,
      year: new Date().getFullYear(),
    },
    { sourceFile: path.join(__dirname, "views/layout.stn") },
  );
  if (layoutResult.errors.length > 0) throw layoutResult.errors[0];
  return layoutResult.html;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = requestUrl(req);
    const { pathname } = url;
    if (serveSharedAsset(req, res, pathname)) return;
    const method = req.method;
    const body = method === "POST" ? await parseForm(req) : null;

    if (method === "GET" && pathname === "/") {
      const requested = url.searchParams.get("filter");
      const filter = ["active", "completed"].includes(requested) ? requested : "all";
      const filtered =
        filter === "active"
          ? todos.filter((t) => !t.completed)
          : filter === "completed"
            ? todos.filter((t) => t.completed)
            : todos;
      const html = await renderPage("index.stn", {
        title: "Tasks",
        description: "A simple task manager built with Stncil.",
        todos: filtered,
        counts: {
          all: todos.length,
          active: todos.filter((t) => !t.completed).length,
          completed: todos.filter((t) => t.completed).length,
        },
        currentFilter: filter,
        message: url.searchParams.get("message") || null,
      });
      sendHtml(res, 200, html);
    } else if (method === "POST" && pathname === "/todos") {
      const title = body.title?.trim();
      if (!title) {
        res.writeHead(303, { Location: "/?message=Title+is+required" });
        res.end();
        return;
      }
      if (title.length > 240)
        throw new HttpError(400, "Task titles must be at most 240 characters");
      todos.unshift({
        id: String(nextId++),
        title,
        completed: false,
        createdAt: new Date(),
      });
      res.writeHead(303, { Location: "/" });
      res.end();
    } else if (method === "POST" && /^\/todos\/\d+\/toggle$/.test(pathname)) {
      const id = pathname.match(/^\/todos\/(\d+)\/toggle$/)[1];
      const todo = todos.find((t) => t.id === id);
      if (!todo) throw new HttpError(404, "Task not found");
      todo.completed = !todo.completed;
      res.writeHead(303, { Location: "/" });
      res.end();
    } else if (method === "GET" && /^\/todos\/\d+\/edit$/.test(pathname)) {
      const id = pathname.match(/^\/todos\/(\d+)\/edit$/)[1];
      const todo = todos.find((t) => t.id === id);
      const html = await renderPage("edit.stn", {
        title: todo ? `Edit: ${todo.title}` : "Not Found",
        description: todo ? `Editing task: ${todo.title}` : "Task not found.",
        todo: todo || null,
      });
      sendHtml(res, todo ? 200 : 404, html);
    } else if (method === "POST" && /^\/todos\/\d+\/update$/.test(pathname)) {
      const id = pathname.match(/^\/todos\/(\d+)\/update$/)[1];
      const todo = todos.find((t) => t.id === id);
      if (!todo) throw new HttpError(404, "Task not found");
      const title = body.title?.trim();
      if (!title || title.length > 240)
        throw new HttpError(400, "Enter a task title of at most 240 characters");
      todo.title = title;
      res.writeHead(303, { Location: "/" });
      res.end();
    } else if (method === "POST" && /^\/todos\/\d+\/delete$/.test(pathname)) {
      const id = pathname.match(/^\/todos\/(\d+)\/delete$/)[1];
      if (!todos.some((todo) => todo.id === id)) throw new HttpError(404, "Task not found");
      todos = todos.filter((t) => t.id !== id);
      res.writeHead(303, { Location: "/" });
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
      sendHtml(res, 404, html);
    }
  } catch (err) {
    sendError(res, err);
  }
});

const PORT = Number(process.env.PORT ?? 3001);
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.listen(PORT, "127.0.0.1", () => {
  console.log(`Todo app running at http://localhost:${server.address().port}/`);
});
