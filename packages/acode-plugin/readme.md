# Stncil Syntax Highlighter

Syntax highlighting support for [Stncil](https://github.com/habibthadev/stncil) template files in Acode editor.

## Features

- Highlights all Stncil template syntax:
  - Block directives (`@if`, `@each`, `@let`, `@cache`, `@async`, etc.)
  - Variable interpolation (`{{ variable }}`, `{{{ raw }}}`)
  - Block comments (`@* comment *@`, `{# comment #}`)
  - Built-in filters (`upper`, `lower`, `truncate`, `json`, etc.)
  - Operators (`&&`, `||`, `==`, `!=`, `|`, `? :`)
  - HTML tags and attributes
  - `<style>` and `<script>` blocks
- Auto-applies to `.stn` and `.stncil` files
- Works with both Ace and CodeMirror editor engines

## Supported Keywords

### Block Directives
`@output`, `@context`, `@if`, `@else if`, `@else`, `@each`, `@empty`, `@async`, `@loading`, `@error`, `@let`, `@cache`, `@layout`, `@slot`, `@import`, `@render`, `@recursive`, `@recurse`, `@head`, `@title`, `@meta`, `@canonical`, `@jsonld`, `@style`, `@script`, `@styles`, `@scripts`, `@csrf`, `@asset`, `@json`, `@nonce`, `@debug`, `@t`, `@boundary`, `@fallback`

### Built-in Filters
`upper`, `lower`, `capitalize`, `title`, `trim`, `ltrim`, `rtrim`, `truncate`, `length`, `first`, `last`, `reverse`, `join`, `sort`, `json`, `raw`, `escape`, `default`, `number_format`, `date_format`, `split`, `replace`

### Operators
`||`, `&&`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `|`, `?`, `:`, `!`, `...`

## Installation

1. Open Acode settings
2. Go to Plugins
3. Search for "Stncil Syntax Highlighter"
4. Install the plugin

## License

MIT
