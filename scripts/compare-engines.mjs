import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { compile } from "../packages/core/dist/index.js";
import { RuntimeEngine } from "../packages/runtime/dist/index.js";

const directory = process.argv[2];
if (!directory)
  throw new Error("Usage: node scripts/compare-engines.mjs <reference-package-folder>");
const require = createRequire(pathToFileURL(resolve(directory, "package.json")));
const projectRequire = createRequire(import.meta.url);
const ejs = require("ejs");
const pug = require("pug");
const handlebars = require("handlebars");
const nunjucks = require("nunjucks");
const { Liquid } = require("liquidjs");
const data = {
  name: "<Ada>&",
  items: Array.from({ length: 20 }, (_, index) => `Item ${index + 1}`),
};
const expected = `<h1>&lt;Ada&gt;&amp;</h1>${data.items.map((item) => `<p>${item}</p>`).join("")}`;
const environment = new nunjucks.Environment(null, { autoescape: true });
const liquid = new Liquid({
  outputEscape: "escape",
  ownPropertyOnly: true,
  strictVariables: true,
  strictFilters: true,
});
const engines = [
  {
    name: "stncil",
    version: projectRequire("../packages/core/package.json").version,
    prepare: async () => {
      const { ir } = await compile({
        source: "<h1>{{ name }}</h1>@each (item in items) {<p>{{ item }}</p>}",
        sourceFile: "benchmark.stn",
        debug: false,
      });
      const engine = new RuntimeEngine(ir);
      return (context) => engine.render(context).html;
    },
  },
  {
    name: "ejs",
    version: require("ejs/package.json").version,
    prepare: () =>
      ejs.compile("<h1><%= name %></h1><% items.forEach(item => { %><p><%= item %></p><% }); %>", {
        compileDebug: false,
      }),
  },
  {
    name: "pug",
    version: require("pug/package.json").version,
    prepare: () => pug.compile("h1= name\neach item in items\n  p= item", { compileDebug: false }),
  },
  {
    name: "handlebars",
    version: require("handlebars/package.json").version,
    prepare: () => handlebars.compile("<h1>{{name}}</h1>{{#each items}}<p>{{this}}</p>{{/each}}"),
  },
  {
    name: "nunjucks",
    version: require("nunjucks/package.json").version,
    prepare: () => {
      const template = new nunjucks.Template(
        "<h1>{{ name }}</h1>{% for item in items %}<p>{{ item }}</p>{% endfor %}",
        environment,
        "benchmark",
        true,
      );
      return (context) => template.render(context);
    },
  },
  {
    name: "liquidjs",
    version: require("liquidjs/package.json").version,
    prepare: () => {
      const template = liquid.parse(
        "<h1>{{ name }}</h1>{% for item in items %}<p>{{ item }}</p>{% endfor %}",
      );
      return (context) => liquid.renderSync(template, context);
    },
  },
];

const results = [];
for (const engine of engines) {
  const render = await engine.prepare();
  assert.equal(render(data), expected, `${engine.name} rendered different HTML`);
  for (let i = 0; i < 300; i++) render(data);
  const rounds = [];
  for (let round = 0; round < 5; round++) {
    const start = performance.now();
    for (let i = 0; i < 3000; i++) render(data);
    rounds.push(((performance.now() - start) * 1000) / 3000);
  }
  const start = performance.now();
  for (let i = 0; i < 100; i++) (await engine.prepare())(data);
  results.push({
    name: engine.name,
    version: engine.version,
    prepareAndFirstRenderMs: (performance.now() - start) / 100,
    warmRenderMicroseconds: [...rounds].sort((a, b) => a - b)[2],
    warmRoundsMicroseconds: rounds,
  });
}
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      workload:
        "escaped heading and 20-item loop; compiled synchronous render; median of five 3000-render rounds",
      results,
    },
    null,
    2,
  ),
);
