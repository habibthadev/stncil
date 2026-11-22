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
