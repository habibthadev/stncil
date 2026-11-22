# stncil

stncil is a template language with an `@` sigil, a compiler, and a streaming renderer.
The TypeScript implementation compiles `.stn` files to JSON intermediate
representation and interprets that representation without evaluating JavaScript
from templates.

## Features

- **Escaped interpolation**: HTML escaping by default, explicit raw HTML, URL validation, URL-component encoding, and script-safe JSON values.
- **Expressions**: arithmetic, comparisons, concatenation, ternaries, arrays, objects, indexing, and filter chains.
- **Scoped blocks**: local bindings, loop metadata, nested loops, and error boundaries.
- **Async rendering**: registered fetchers, concurrent sibling work, ordered streams, cancellation, and error branches.
- **Composition**: layouts, named/default slots, relative imports, isolated partial props, and bounded composition depth.
- **Context declarations**: objects, optional fields, arrays, nullable unions, and string-keyed records, with generated TypeScript declarations.
- **Compiled-template caching**: a bounded in-memory LRU cache keyed by source and filename.
- **Application tokens**: explicit CSRF fields, CSP nonces, and asset-manifest output.

Core and runtime use web-standard APIs. The high-level loader accepts a filesystem
adapter. This repository supplies a JavaScript runtime; it does not yet supply
runtime ports for Python, Go, or other languages.

The [comparison script](scripts/compare-engines.mjs) measures compiled rendering
against reference engines. Head collection, script directives, translation, and
fragment caching remain incomplete and are not part of the supported feature list
above.

## Packages

| Package                               | Description                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| [`@stncil/core`](packages/core)       | Lexer, parser, type checker, and code emitter — compiles `.stn` templates to IR |
| [`@stncil/runtime`](packages/runtime) | IR executor, HTML/URL/CSS escape utilities, and built-in filters                |
| [`stncil`](packages/engine)           | High-level `Engine` API with template loader and compiler cache                 |

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

const result = await engine.compileAndRender(`<h1>Hello {{ name }}</h1>`, { name: "World" });

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
  body: "Hello world",
});

const final = await engine.compileAndRender(layout, {
  title: "My Page",
  content: pageResult.html,
});
```

## Template Syntax

### Variable Interpolation

Literal whitespace is preserved around output and between directives. Always
quote HTML attributes; HTML escaping alone does not make unquoted attributes or
arbitrary script/CSS positions safe.

```stncil
{{ user.name }}              {# HTML-escaped output #}
{{ user.bio | trust("html") }}  {# Raw HTML (trusted) #}
{{{ user.content }}}         {# Raw HTML (triple braces) #}
```

Template paths read only own object properties. Inherited fields and prototype
methods are unavailable; plain objects, JSON records, and array indices work as
usual. Raw HTML output should contain only content your application trusts.

HTML escaping is the default. Use `url_encode` for a URL component, `url` to
validate a complete URL's scheme, and `@json(value)` to insert a JSON value in a
script or JSON document. `@json` escapes characters that could close a script
element. It is a JSON value directive, not an HTML-attribute directive.
Unknown filters are render errors. Custom filters can be registered per engine
through the `filters` option.

`@csrf` emits a hidden `_csrf` field and requires a `csrfToken` render option.
The application must validate that token on submission. `@nonce` requires the
application's CSP `nonce`; `@asset` reads `assetManifest` when provided. Tokens
and nonces belong to the application and are never invented by the renderer.

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

Loops expose `loop.index` (one-based), `loop.index0`, `loop.first`, `loop.last`,
`loop.length`, `loop.revindex`, and `loop.revindex0`. Nested loops can read the
outer loop through `loop.parent`. Block-local `@let` bindings stay inside their
block, and iteration bindings can shadow outer names.

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

Register fetchers on the engine with `new Engine({ fetchers: { fetchUser } })`.
Each fetcher receives its template arguments followed by `{ signal }`; the signal
is aborted when a stream is cancelled. Fetcher arguments are unknown values and
should be validated in the adapter. Both `binding = fetcher(...)` and
`binding from fetcher(...)` work. Sibling async blocks start together; streamed
HTML preserves document order. `@error` renders the fetch failure when provided.

The runtime's synchronous `render()` handles synchronous IR. Use `renderAsync()`
or the high-level engine for async templates. Ordered streams await async blocks;
they do not send DOM replacement scripts for `@loading` bodies.

### Layout and Slots

```stncil
@layout("base") {
  @slot("title") { {{ page.title }} }
  @slot("body") { <p>{{ page.content }}</p> }
}
```

Register layout and partial templates with `engine.registerTemplate(path, source)`
or provide a filesystem adapter. Import aliases resolve relative to the calling
template: `@import { Card } from "./card.stn"`, then `@render Card({ title: title })`.
Partials receive their explicit props; they do not inherit the caller's data.
Named props override spread props. Composition is limited to 32 levels by
default; `maxTemplateDepth` accepts a positive safe integer.

### Styles and Script Data

`@style` writes an inline style element. It does not currently scope selectors or
collect styles from other templates into the head.

```stncil
@style {
  .card { border: 1px solid #ccc; }
}
```

Use an external script for application behavior. For bootstrap data in a native
script element, `@json(value)` writes a JSON value with script-closing characters
escaped. The application owns the CSP policy and supplies any required nonce.

`@script`, `@head`, `@styles`, and `@scripts` are parsed prototypes with incomplete
runtime behavior. Do not rely on them for generated page content yet.

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

Grouped unions and repeated array suffixes work: `(number | null)[][]`.
String-keyed records use `Record<string, number>`. Unknown named types and literal
string unions are rejected rather than silently widened to strings.

Context declarations check template references and generate types. They do not
validate the data supplied at render time. Use `strict: true` to make compiler
diagnostics errors; strict mode defaults to false. Validate external data in your
application. The checker is not a complete type system for every expression.

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

| Command           | Description             |
| ----------------- | ----------------------- |
| `pnpm build`      | Build all packages      |
| `pnpm test`       | Run test suite          |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm typecheck`  | Type-check all packages |
| `pnpm lint`       | Lint source files       |
| `pnpm format`     | Format source files     |
| `pnpm clean`      | Clean build artifacts   |

Run the examples with pnpm:

```sh
pnpm examples:check
pnpm examples:output
pnpm examples:http
pnpm examples:preview
```

The preview server reads the generated HTML in `.stncil-examples/`.
Fonts load through the CDN; no font binaries are bundled.

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
