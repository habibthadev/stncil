import http from "node:http";
import { readFile, readdir } from "node:fs/promises";

const directory = new URL("../.stncil-examples/", import.meta.url);
const assets = new Map();
for (const name of (await readdir(directory)).filter((name) => name.endsWith(".html")))
  assets.set(`/${name}`, {
    content: await readFile(new URL(name, directory)),
    type: "text/html; charset=utf-8",
  });
assets.set("/apps/examples/shared/design.css", {
  content: await readFile(new URL("../apps/examples/shared/design.css", import.meta.url)),
  type: "text/css",
});
assets.set("/favicon.ico", {
  content:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="4" y="48" font-size="48">&#64;</text></svg>',
  type: "image/svg+xml",
});
const server = http.createServer((request, response) => {
  const asset = assets.get(new URL(request.url, "http://localhost").pathname);
  response.writeHead(asset ? 200 : 404, {
    "Content-Type": asset?.type ?? "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  response.end(
    asset?.content ?? "Example not found. Run pnpm examples:check and pnpm examples:output first.",
  );
});
server.listen(Number(process.env.PORT ?? 3010), "127.0.0.1", () =>
  console.log(`Example previews running at http://localhost:${server.address().port}/hello.html`),
);
