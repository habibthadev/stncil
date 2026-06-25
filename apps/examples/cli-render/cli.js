#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Engine } from "stncil";

const engine = new Engine({ debug: false });

function usage() {
  console.log(`
Usage:
  stn-render <template.stn> <data.json>        Render template with JSON data
  stn-render <template.stn> --data '{...}'     Render with inline JSON
  stn-render --stdin                           Read template from stdin, data from DATA env

Examples:
  stn-render greeting.stn data.json
  stn-render greeting.stn --data '{"name":"World"}'
  DATA='{"name":"World"}' stn-render --stdin < greeting.stn
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  let templateSource;
  let dataSource = {};

  if (args.includes("--stdin")) {
    templateSource = await readStdin();
    const envData = process.env.DATA;
    if (envData) {
      try {
        dataSource = JSON.parse(envData);
      } catch {
        console.error("Error: DATA env var is not valid JSON");
        process.exit(1);
      }
    }
  } else {
    const [templatePath, dataPath] = args;
    if (!templatePath) {
      console.error("Error: missing template path");
      usage();
      process.exit(1);
    }

    templateSource = fs.readFileSync(templatePath, "utf-8");

    const dataIndex = args.indexOf("--data");
    if (dataIndex !== -1 && args[dataIndex + 1]) {
      try {
        dataSource = JSON.parse(args[dataIndex + 1]);
      } catch {
        console.error("Error: --data value is not valid JSON");
        process.exit(1);
      }
    } else if (dataPath && dataPath !== "--data") {
      try {
        dataSource = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
      } catch (err) {
        console.error(`Error reading data file "${dataPath}":`, err.message);
        process.exit(1);
      }
    }

    if (args.includes("--watch") || args.includes("-w")) {
      watchAndRender(templatePath, templateSource, dataSource);
      return;
    }
  }

  dataSource.now = new Date();
  await renderAndPrint(templateSource, dataSource);
}

async function renderAndPrint(source, data) {
  try {
    const result = await engine.compileAndRender(source, data);
    if (result.errors.length > 0) {
      console.error("Render warnings/errors:");
      for (const err of result.errors) {
        console.error("  -", err.message);
      }
    }
    process.stdout.write(result.html);
  } catch (err) {
    console.error("Render error:", err.message);
    process.exit(1);
  }
}

function watchAndRender(templatePath, source, data) {
  console.error(`Watching ${templatePath} for changes...`);
  data.now = new Date();
  renderAndPrint(source, data);

  fs.watch(templatePath, (eventType) => {
    if (eventType === "change") {
      console.error(`\n${new Date().toLocaleTimeString()} File changed, re-rendering...`);
      const updated = fs.readFileSync(templatePath, "utf-8");
      data.now = new Date();
      renderAndPrint(updated, data);
    }
  });
}

function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(chunks.join("")));
  });
}

main();
