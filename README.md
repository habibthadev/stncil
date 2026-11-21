# stncil

A typed, streaming-capable, runtime-agnostic template engine for TypeScript. `.stn` files compile to an intermediate representation and render to HTML, text, or XML — with escape safety at every output context.

## Features

- **Typed context contracts** — `@context` blocks declare expected data shapes; mismatches are compile errors, not silent failures
- **Escape-safe output** — `{{ }}` is HTML-escaped by default; dedicated escape paths for URL, CSS, JSON, and XML contexts
- **Streaming rendering** — `@async` blocks resolve in parallel; output is a `ReadableStream` that flushes as data arrives
- **Head collection** — `@style`, `@script`, `@head`, and `@csrf` blocks from anywhere in the render tree merge into `<head>`
- **Layout composition** — `@layout` and `@slot` for template inheritance
- **Recursive templates** — `@recursive` for tree structures like nested comments
- **Built-in filters** — `capitalize`, `upper`, `lower`, `truncate`, `date_format`, `default`, `join`, `length`, `reverse`, `json`, `url_encode`, `number_format`, and more
- **Runtime-agnostic** — runs on Node.js, Bun, Deno, and Cloudflare Workers (WHATWG standard APIs only in core/runtime)
- **Compiled IR** — templates compile once, cache in memory, render on every request

## Packages

| Package | Description |
|---------|-------------|
| [`@stncil/core`](packages/core) | Lexer, parser, type checker, and code emitter — compiles `.stn` templates to IR |
| [`@stncil/runtime`](packages/runtime) | IR executor, HTML/URL/CSS escape utilities, and built-in filters |
| [`@stncil/engine`](packages/engine) | High-level `Engine` API with template loader and compiler cache |

## Quick Start

```bash
# Install
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Typecheck
pnpm typecheck
```

### Basic Usage

```ts
import { Engine } from "stncil";

const engine = new Engine();

const result = await engine.compileAndRender(
  `<h1>Hello {{ name }}</h1>`,
  { name: "World" }
);

console.log(result.html); // <h1>Hello World</h1>
```

The engine caches up to 256 compiled templates by source and file name. Use
`new Engine({ cacheSize: 128 })` to change the capacity, or `{ cache: false }` or
`{ cacheSize: 0 }` to disable caching. Capacity must be a non-negative safe integer.

### With Layout Composition

```ts
// layout.stn
const layout = `
<!DOCTYPE html>
<html>
<head><title>{{ title }}</title></head>
<body>{{{ content }}}</body>
</html>`;

// page.stn
const page = `<h1>{{ title }}</h1><p>{{ body }}</p>`;

// Render page, then inject into layout
const pageResult = await engine.compileAndRender(page, {
  title: "My Page",
  body: "Hello world"
});

const final = await engine.compileAndRender(layout, {
  title: "My Page",
  content: pageResult.html
});
```

## Template Syntax

### Variable Interpolation

```stncil
{{ user.name }}              {# HTML-escaped output #}
{{ user.bio | trust("html") }}  {# Raw HTML (trusted) #}
{{{ user.content }}}         {# Raw HTML (triple braces) #}
{{- user.name -}}            {# Trim whitespace both sides #}
```

### Conditional Blocks

```stncil
@if (user != null) {
  <p>Welcome, {{ user.name }}</p>
} @else if (guest != null) {
  <p>Welcome, guest</p>
} @else {
  <p>Please sign in</p>
}
```

### Iteration

```stncil
@each (post in posts) {
  <article>{{ post.title }}</article>
}

@each (post, index in posts) {
  <li class="{{ index == 0 ? 'first' : '' }}">{{ post.title }}</li>
}
```

### Local Variables

```stncil
@let isOwner = user.id == post.authorId
@let visiblePosts = posts | filter("published", true)
```

### Async Blocks

```stncil
@async (data = fetchUser(userId)) {
  <p>{{ data.name }}</p>
}
```

### Layout and Slots

```stncil
@layout("base") {
  @slot("title") { {{ page.title }} }
  @slot("body") { <p>{{ page.content }}</p> }
}
```

### Style and Script Blocks

```stncil
@style {
  .card { border: 1px solid #ccc; }
}

@script(defer) {
  console.log("loaded");
}
```

### Output Modes

```stncil
@output(html)   {# default #}
@output(text)   {# strips HTML tags from output #}
@output(xml)    {# XML escaping #}
```

### Context Declaration

```stncil
@context {
  title: string,
  posts: { title: string, body: string, author: string }[],
  user?: { name: string, avatar?: string }
}
```

### Filters

```stncil
{{ name | capitalize }}
{{ price | number_format(2, ".", ",") }}
{{ created | date_format("YYYY-MM-DD") }}
{{ items | join(", ") }}
{{ text | truncate(100, "...") }}
{{ value | default("N/A") }}
{{ data | json }}
```

## Project Structure

```
stncil/
├── packages/
│   ├── core/           # Lexer → Parser → TypeChecker → Emitter
│   ├── runtime/        # Executor, escapes, filters
│   └── engine/         # Engine API, loader, cache
├── apps/examples/
│   ├── basic-http/     # HTTP server with layout composition
│   ├── cli-render/     # Command-line template rendering
│   ├── api-email/      # Email templates
│   ├── todo-app/       # CRUD todo app
│   └── link-shortener/ # URL shortener with full UI
├── examples/           # Standalone .stn template demos
├── packages/
│   ├── vscode-extension/  # VSCode syntax highlighting
│   └── acode-plugin/      # ACode syntax highlighting
└── scripts/            # Build and fix utilities
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run test suite |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint source files |
| `pnpm format` | Format source files |
| `pnpm clean` | Clean build artifacts |

## Editor Support

- **VSCode** — syntax highlighting via [`packages/vscode-extension`](packages/vscode-extension)
- **ACode** (Android) — syntax highlighting via [`packages/acode-plugin`](packages/acode-plugin)

Install the VSCode extension:

```bash
cd packages/vscode-extension
vsce package
code --install-extension stncil-*.vsix
```

## License

MIT
