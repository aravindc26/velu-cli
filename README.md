# Velu

A modern documentation site generator. Write Markdown, configure with JSON, ship a beautiful docs site.

## Install

```bash
npm install -g @aravindc26/velu
```

## Quick Start

```bash
mkdir my-docs && cd my-docs
velu init
velu run
```

Your site is live at `http://localhost:4321`.

`velu init` scaffolds a complete example project with `velu.json`, sample pages, tabs, and groups — ready to customize.

## CLI Commands

| Command              | Description                                      |
| -------------------- | ------------------------------------------------ |
| `velu init`          | Scaffold a new docs project with example files   |
| `velu lint`          | Validate `velu.json` and check referenced pages  |
| `velu run`           | Build and start the dev server (default port 4321)|
| `velu run --port N`  | Start on a custom port                           |
| `velu build`         | Build the site without starting a server         |

## Navigation

Velu supports three levels of navigation hierarchy:

### Tabs

Top-level horizontal navigation rendered in the header.

```json
{
  "tab": "SDKs",
  "pages": ["sdk/fetch", "sdk/create"]
}
```

External link tabs:

```json
{
  "tab": "Blog",
  "href": "https://blog.example.com"
}
```

### Groups

Collapsible sidebar groups containing pages or nested groups.

```json
{
  "group": "Getting Started",
  "pages": ["quickstart", "installation"]
}
```

### Pages

Reference markdown files by their path relative to the docs directory, without the `.md` extension:

```
"quickstart"           → quickstart.md
"guides/installation"  → guides/installation.md
```

## File Watching

During `velu run`, changes to `.md` files and `velu.json` in the docs directory are automatically synced and hot-reloaded — no restart needed.

## License

MIT
