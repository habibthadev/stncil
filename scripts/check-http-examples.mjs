import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { get } from "node:http";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const children = [];
const logs = new Map();
let passed = false;
const keep = process.argv.includes("--keep");
function stop() {
  for (const child of children) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch (error) {
      if (error.code !== "ESRCH") console.error("Could not stop example:", error.message);
    }
  }
}
process.once("SIGINT", () => {
  stop();
  process.exitCode = 130;
});
process.once("SIGTERM", () => {
  stop();
  process.exitCode = 143;
});

async function start(name) {
  const child = spawn("pnpm", ["--filter", name, "start"], {
    cwd: root,
    env: { ...process.env, PORT: "0" },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  return new Promise((resolve, reject) => {
    let log = "";
    const timeout = setTimeout(() => reject(new Error(`${name} did not start: ${log}`)), 15_000);
    const read = (chunk) => {
      log = (log + chunk).slice(-8000);
      logs.set(name, log);
      const match = log.match(/running at http:\/\/localhost:(\d+)\//);
      if (match) {
        clearTimeout(timeout);
        resolve(`http://localhost:${match[1]}`);
      }
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`${name} exited with ${code}: ${log}`));
    });
  });
}

async function page(url) {
  const response = await fetch(url, { redirect: "manual" });
  return { response, html: await response.text() };
}
function token(html) {
  const match = html.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(match, "A form is missing its CSRF token");
  return match[1];
}
function post(base, path, fields) {
  return fetch(`${base}${path}`, {
    method: "POST",
    body: new URLSearchParams(fields),
    redirect: "manual",
  });
}

function statusWithHost(url, host) {
  return new Promise((resolve, reject) => {
    const request = get(url, { headers: { Host: host } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    });
    request.on("error", reject);
  });
}

try {
  const basic = await start("example-basic-http");
  const todo = await start("example-todo-app");
  const links = await start("example-link-shortener");
  assert.equal((await page(basic)).response.status, 200);
  const greeting = await page(
    `${basic}/hello?name=${encodeURIComponent("<script>alert(1)</script>")}`,
  );
  assert.equal(greeting.response.status, 200);
  assert.ok(greeting.html.includes("&lt;script&gt;"));
  assert.equal((await page(`${basic}/missing`)).response.status, 404);
  assert.equal(await statusWithHost(basic, "outside.example"), 400);
  assert.equal(await statusWithHost(basic, "localhost/path"), 400);
  console.log("PASS basic-http: pages, escaping, missing route, host validation");

  const tasks = await page(todo);
  const taskToken = token(tasks.html);
  assert.equal((await post(todo, "/todos", { title: "missing token" })).status, 403);
  assert.equal((await post(todo, "/todos", { _csrf: "wrong", title: "wrong token" })).status, 403);
  const malformed = (body) =>
    fetch(`${todo}/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  assert.equal((await malformed(`_csrf=${taskToken}&title=first&title=second`)).status, 400);
  assert.equal((await malformed(`_csrf=${taskToken}&title=%ZZ`)).status, 400);
  assert.equal((await malformed(Buffer.from([0xff]))).status, 400);
  const taskTitle = "Task 🦉 <img src=x onerror=alert(1)>";
  assert.equal((await post(todo, "/todos", { _csrf: taskToken, title: taskTitle })).status, 303);
  const added = await page(todo);
  assert.ok(added.html.includes("Task 🦉 &lt;img"));
  const id = added.html.match(/action='\/todos\/(\d+)\/toggle'/)[1];
  assert.equal((await post(todo, `/todos/${id}/toggle`, { _csrf: taskToken })).status, 303);
  assert.equal((await page(`${todo}/todos/${id}/edit`)).response.status, 200);
  assert.equal(
    (await post(todo, `/todos/${id}/update`, { _csrf: taskToken, title: "Updated task" })).status,
    303,
  );
  assert.equal((await post(todo, `/todos/${id}/delete`, { _csrf: taskToken })).status, 303);
  assert.equal((await page(`${todo}/todos/${id}/edit`)).response.status, 404);
  assert.equal(
    (await post(todo, "/todos", { _csrf: taskToken, title: "x".repeat(17_000) })).status,
    413,
  );
  assert.equal(
    (
      await fetch(`${todo}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    415,
  );
  console.log("PASS todo-app: create, toggle, edit, update, delete, Unicode, CSRF, body limits");

  const dashboard = await page(links);
  const linkToken = token(dashboard.html);
  assert.equal(
    (await post(links, "/links", { _csrf: linkToken, url: "javascript:alert(1)" })).status,
    400,
  );
  assert.equal(
    (await post(links, "/links", { _csrf: linkToken, url: "https://user:password@example.com" }))
      .status,
    400,
  );
  const slug = `check-${process.pid}`;
  assert.equal(
    (
      await post(links, "/links", {
        _csrf: linkToken,
        url: "example.com/first",
        slug,
        title: "<strong>Label</strong>",
      })
    ).status,
    302,
  );
  const created = await page(links);
  assert.ok(created.html.includes("&lt;strong&gt;Label&lt;/strong&gt;"));
  const linkId = created.html.match(/href='\/links\/(\d+)\/edit'/)[1];
  const redirect = await fetch(`${links}/${slug}`, { redirect: "manual" });
  assert.equal(redirect.headers.get("location"), "https://example.com/first");
  assert.equal(
    (
      await post(links, `/links/${linkId}/update`, {
        _csrf: linkToken,
        url: "https://example.com/updated",
        title: "Updated link",
      })
    ).status,
    302,
  );
  assert.equal((await post(links, `/links/${linkId}/delete`, { _csrf: linkToken })).status, 302);
  assert.equal((await page(`${links}/${slug}`)).response.status, 404);
  assert.equal((await page(`${links}/main.css?v=1`)).response.status, 200);
  assert.equal((await page(`${links}/app.js?v=1`)).response.status, 200);
  assert.equal((await page(`${links}/../index.js`)).response.status, 404);
  assert.equal((await page(`${links}/%2e%2e%2findex.js`)).response.status, 404);
  console.log("PASS link-shortener: CRUD, redirects, escaping, URL validation, static assets");
  if (keep) console.log(JSON.stringify({ basic, todo, links }));
  passed = true;
} catch (error) {
  for (const [name, log] of logs) console.error(`${name}: ${log}`);
  throw error;
} finally {
  if (!keep || !passed) stop();
}
