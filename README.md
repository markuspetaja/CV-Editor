# CV Editor

A fully client-side CV editor with live PDF preview, built with vanilla JavaScript. No server, no installation, no account — just open the HTML file in a browser.

## Features

- **Live PDF Preview** — see your changes rendered in real time using [pdf-lib](https://pdf-lib.js.org/)
- **Multiple Section Types** — Text, List (experience/education), Condensed, Tags (skills), Table, Achievements
- **Multiple Variants** — maintain separate CVs for different job applications in one place
- **Snapshot History** — take named snapshots before major changes; restore anytime
- **Design Controls** — font selection, size scale, margins, page size, color palettes, photo shape
- **AI Integration** — keyword gap analysis, summary rewriter, and cliché checker via OpenAI, Google Gemini, or Anthropic Claude
- **ATS Preview** — see how the CV looks as plain text (as an ATS would parse it)
- **Undo / Redo** — full undo/redo stack with Ctrl+Z / Ctrl+Y
- **JSON Export / Import** — save and load projects as portable `.json` files
- **PDF Download** — export a correctly formatted PDF with embedded metadata (Ctrl+P)

## Getting Started

Download or clone the repo, then open `cv_editor.html` directly in any modern browser — no server, no build step, no install.

> **Note:** The AI tab needs an internet connection to reach the provider APIs. Everything else (editing, PDF export, history) works fully offline.

## AI Features

The AI tab requires an API key from one of the supported providers:

| Provider | Models |
|----------|--------|
| OpenAI |
| Google Gemini | gemini-2.5-flash |
| Anthropic |

> **Privacy:** Your API key is stored in `localStorage` on your device only. It is sent directly to the provider's API and nowhere else. This tool has no backend.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+S` | Save |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+Shift+P` | Download PDF |

## Formatting in Text Fields

Use simple markup in text and description fields:

| Syntax | Result |
|--------|--------|
| `*bold*` | **bold** |
| `_italic_` | *italic* |
| `~underline~` | underline |
| `- item` | bullet point |

## Project Structure

```text
cv_editor.html          — Main entry point
css/
  style.css             — All UI styles
js/
  utils.js              — Pure helper functions (UUID, debounce, cliché detection, etc.)
  schema.js             — Data shape, constants, and versioned migrations (v1→v5)
  store.js              — Single source of truth; all mutations go through here
  storage.js            — Persistence: variants in localStorage, history in IndexedDB
  rich-text.js          — Lightweight markup parser for bold/italic/underline/bullets
  keyboard.js           — Keyboard shortcut registry
  pdf-renderer.js       — PDF generation with pdf-lib
  ui.js                 — DOM rendering and event delegation
  ai.js                 — AI provider integrations (OpenAI, Gemini, Anthropic)
  main.js               — App entry point; wires everything together
data/
  default_project.json  — Demo CV loaded on first run
```

## Dependencies

Loaded from CDN:

- [pdf-lib](https://pdf-lib.js.org/) — PDF generation
- [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) — Font embedding

## License

MIT — see [LICENSE](LICENSE).
