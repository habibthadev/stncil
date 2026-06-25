# Link Shortener — Stncil Example App

A full-stack URL shortener built with the [stncil](https://github.com/habibthadev/stncil) template engine. Demonstrates server-rendered HTML with dynamic data, form validation, theme switching, and CRUD operations — all without a client-side framework.

## Features

- **Shorten URLs** — create short links with auto-generated or custom slugs
- **Click tracking** — per-link click counts with aggregate metrics
- **Edit links** — update destination URL and label
- **Delete with confirmation** — native `<dialog>` modal for safe deletes
- **Dark / light theme** — persists to `localStorage`, respects `prefers-color-scheme`
- **Custom validation** — client-side form validation with inline error messages
- **Copy to clipboard** — one-click copy of the short URL with toast notification
- **Responsive design** — works on mobile and desktop
- **Inter font + burnt orange palette** — Inter via Google Fonts, rounded corners, soft shadows

## Tech Stack

| Layer | Tool |
|-------|------|
| Templates | [stncil](https://github.com/habibthadev/stncil) `.stn` files |
| Server | Node.js `http` module (no framework) |
| Styles | SCSS → compiled to `public/main.css` |
| Icons | [Iconify](https://iconify.design) via `iconify-icon` web component |
| Fonts | Inter (Google Fonts) |

## Project Structure

```
link-shortener/
├── index.js                  # HTTP server + routes + in-memory store
├── package.json
├── public/
│   ├── main.css              # Compiled CSS
│   └── app.js                # Client-side JS (theme, dialog, validation, copy)
├── styles/scss/
│   ├── main.scss             # SCSS entry point
│   ├── _variables.scss       # Design tokens (colors, radii, shadows, spacing)
│   ├── _reset.scss           # Box-sizing reset
│   ├── _base.scss            # Typography, color palette, dark mode
│   ├── _layout.scss          # Nav, metrics grid, container, responsive
│   ├── _components.scss      # Buttons, cards, forms, dialog, toast, empty state
│   └── _utilities.scss       # sr-only, text-center, truncate
└── views/
    ├── layout.stn            # HTML shell (head, nav, dialog, footer)
    ├── index.stn             # Dashboard: metrics, form, link list
    └── edit.stn              # Edit form page
```

## Getting Started

```bash
# From the stncil repo root
cd apps/examples/link-shortener

# Install dependencies
pnpm install

# Build CSS and start the server
pnpm start
```

The app runs at **http://localhost:3002**.

## How It Works

### Rendering Pipeline

The server uses stncil's `Engine.compileAndRender()` twice per request:

1. **Page template** (`index.stn` or `edit.stn`) is rendered with link data → inner HTML
2. **Layout template** (`layout.stn`) wraps the inner HTML via `{{{ content }}}` (raw output)

This two-pass approach keeps the layout concern separate from page content.

### Client-Side JavaScript

All JS lives in `public/app.js` — a static file served directly by the HTTP server. This is necessary because stncil's lexer treats `}` as a block-closing token (`RBRACE`), which corrupts JavaScript inside inline `<script>` tags.

Interactive behavior uses **event delegation** — `data-*` attributes on elements, with `document.addEventListener` in `app.js`:

| Attribute | Handler | Purpose |
|-----------|---------|---------|
| `data-copy="slug"` | click → clipboard | Copy short URL |
| `data-delete="id"` | click → dialog | Open delete confirmation |
| `data-validate="link"` | submit → validation | Validate create form |
| `data-validate="edit"` | submit → validation | Validate edit form |
| `#theme-toggle` | click → toggleTheme | Switch dark/light |
| `#dialog-cancel` | click → closeDialog | Dismiss dialog |
| `#dialog-confirm` | click → confirmDelete | Submit delete |

**Note:** Template expressions (`{{ }}`) inside double-quoted HTML attributes are not evaluated by the stncil engine (the lexer consumes them as literal strings). Single-quoted attributes work correctly: `data-copy='{{ link.slug }}'`.

### In-Memory Store

Links are stored in a plain array — no database. Data resets on server restart. This keeps the example focused on the template engine, not persistence.

### Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Dashboard with metrics, form, and link list |
| POST | `/links` | Create a new short link |
| GET | `/links/:id/edit` | Edit form for a link |
| POST | `/links/:id/update` | Update a link |
| POST | `/links/:id/delete` | Delete a link |
| GET | `/:slug` | Redirect to the original URL (increments click count) |

### CSS Architecture

SCSS is organized into focused partials:

- **`_variables.scss`** — design tokens: Inter font stack, `--radius-*` for rounded corners, `--shadow-*` for depth, `--transition-*` for smooth animations
- **`_base.scss`** — warm cream (`#faf8f5`) / burnt orange (`#e85d26`) palette with full dark mode via `[data-theme="dark"]`
- **`_layout.scss`** — sticky nav with backdrop blur, responsive metrics grid, container widths
- **`_components.scss`** — card-based link list, rounded buttons with hover lift, form fields with focus rings, `<dialog>` modal styles, toast notifications

## Known Stncil Limitations

These affect this app and are documented as engine issues:

1. **`}` in `<script>` tags** — the lexer tokenizes `}` as `RBRACE`, corrupting JS. Workaround: use static `.js` files.
2. **Quotes stripped from HTML attributes** — all attribute values are output unquoted. Valid HTML, but breaks inline JS with string arguments.
3. **`{{ }}` in double-quoted attributes** — not evaluated (treated as literal string tokens). Use single quotes instead.
4. **`@script` blocks** — the executor's `SCRIPT_BLOCK` handler outputs empty strings (unimplemented).
