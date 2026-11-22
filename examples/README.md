# Run the standalone examples

From the repository root, run `pnpm examples:check`. The command builds stncil,
renders every `.stn` file in this folder with the data in `fixtures.mjs`, and checks
the expected content. Generated HTML goes into `.stncil-examples/`.

The fixtures use a fixed date and registered local fetchers. No external API is
needed for async rendering. Change the fixtures to try different data; keep the
checks in sync when changing a template's intended output.

For interactive examples, run these from the repository root:

```sh
pnpm --filter example-basic-http start
pnpm --filter example-todo-app start
pnpm --filter example-link-shortener start
pnpm --filter example-api-email start
pnpm --filter example-cli-render exec node cli.js greeting.stn data.json
```

The HTTP examples use ports 3000, 3001, and 3002 respectively. The email and CLI
examples write rendered HTML to stdout. The HTTP examples keep their data in
memory; restarting them restores the demonstration data.

The examples share the design in `apps/examples/shared/design.scss`. Build its CSS
with `pnpm --filter example-link-shortener build:css`. Fonts load from the CDN;
control icons are local. The full rules are in `apps/examples/DESIGN.md`.

To render, check, and preview all examples:

```sh
pnpm examples:check
pnpm examples:output
pnpm examples:http
pnpm examples:preview
```

The preview server opens the generated pages at `http://localhost:3010/hello.html`.
The other preview names include `dashboard.html`, `user-card.html`,
`cli-greeting.html`, `email-welcome.html`, and `email-notification.html`.
Standalone forms and post/pagination links demonstrate markup for an owning app;
the HTTP examples provide live handlers for their own workflows.
