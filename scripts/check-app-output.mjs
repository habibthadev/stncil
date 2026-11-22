import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { renderWelcomeEmail, renderNotification } from "../apps/examples/api-email/index.js";

const output = new URL("../.stncil-examples/", import.meta.url);
await mkdir(output, { recursive: true });
const welcome = await renderWelcomeEmail(
  {
    name: "Ada <Lovelace>",
    email: "ada@example.com",
    plan: "premium",
    joined_at: new Date(2026, 5, 24),
  },
  "stncil",
  "https://example.com/dashboard",
);
assert.equal(welcome.errors.length, 0);
assert.ok(welcome.html.includes("Ada &lt;Lovelace&gt;"));
assert.ok(welcome.html.includes("June 24, 2026"));
assert.ok(welcome.html.includes("max-width: 480px"));
await writeFile(new URL("email-welcome.html", output), welcome.html);
const notification = await renderNotification({
  subject: "Your report is ready",
  type: "info",
  message: "The weekly report is ready to review.",
  timestamp: new Date(2026, 5, 25, 14, 30),
  details: [
    { label: "Period", value: "Jun 18 to Jun 24" },
    { label: "Views", value: "14,283" },
  ],
  action_url: "https://example.com/report",
  action_label: "View report",
});
assert.equal(notification.errors.length, 0);
assert.ok(notification.html.includes("Jun 25, 14:30"));
assert.ok(notification.html.includes("border-top: 1px solid #e6e6e4"));
await writeFile(new URL("email-notification.html", output), notification.html);
const unsafe = await renderWelcomeEmail({ name: "Ada" }, "stncil", "javascript:alert(1)");
assert.ok(unsafe.errors.length > 0, "Unsafe email action URL was accepted");
console.log(
  "PASS api-email: escaping, dates, conditional styles, responsive tables, URL validation",
);

function cli(args, input, data) {
  const result = spawnSync(
    "pnpm",
    ["--filter", "example-cli-render", "exec", "node", "cli.js", ...args],
    {
      encoding: "utf8",
      input,
      timeout: 15_000,
      env: { ...process.env, ...(data ? { DATA: data } : {}) },
    },
  );
  if (result.error) throw result.error;
  return result;
}
const greeting = cli(["greeting.stn", "data.json"]);
assert.equal(greeting.status, 0, greeting.stderr);
assert.ok(greeting.stdout.includes("<h1>Hello,"));
await writeFile(new URL("cli-greeting.html", output), greeting.stdout);
const inline = cli(["greeting.stn", "--data", '{"name":"<Ada>","items":[]}']);
assert.equal(inline.status, 0, inline.stderr);
assert.ok(inline.stdout.includes("&lt;ADA&gt;"));
const stdin = cli(["--stdin"], "Hello {{ name }}", '{"name":"Ada"}');
assert.equal(stdin.status, 0, stdin.stderr);
assert.ok(stdin.stdout.endsWith("Hello Ada"));
for (const args of [
  ["greeting.stn", "--data", "null"],
  ["greeting.stn", "--data", "[]"],
  ["greeting.stn", "--data"],
  ["missing.stn"],
]) {
  const result = cli(args);
  assert.equal(result.status, 1);
  assert.ok(!result.stdout.includes("<h1>"), "The CLI wrote HTML after an input error");
}
const failed = cli(["--stdin"], "<p>partial</p>{{ name | unknown_filter }}", '{"name":"Ada"}');
assert.equal(failed.status, 1);
assert.ok(!failed.stdout.includes("<p>partial</p>"), "The CLI wrote incomplete HTML");
console.log("PASS cli-render: files, inline JSON, stdin, input errors, atomic output");
