# Velu

A modern documentation site generator. Write Markdown, configure with JSON, ship a beautiful docs site.

## Install

```bash
npm install -g github:YOUR_USERNAME/velu
```

## Quick Start

1. Create a directory with your docs:

```
my-docs/
  velu.json
  quickstart.md
  guides/
    installation.md
    editor.md
```

2. Define your navigation in `velu.json`:

```json
{
  "$schema": "https://raw.githubusercontent.com/YOUR_USERNAME/velu/main/schema/velu.schema.json",
  "navigation": {
    "tabs": [
      {
        "tab": "API Reference",
        "pages": ["api-reference/get", "api-reference/post"]
      }
    ],
    "groups": [
      {
        "group": "Getting Started",
        "pages": ["quickstart", "guides/installation"]
      }
    ]
  }
}
```

3. Run the dev server:

```bash
cd my-docs
velu run
```

Your site is live at `http://localhost:4321`.

## CLI Commands

| Command              | Description                                      |
| -------------------- | ------------------------------------------------ |
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
