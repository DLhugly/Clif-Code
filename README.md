<p align="center">
  <h1 align="center">Clif</h1>
  <p align="center"><strong>AI-native code editor that stays out of your way.</strong></p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#development">Development</a> &middot;
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://github.com/DLhugly/Clif/releases"><img src="https://img.shields.io/github/v/release/DLhugly/Clif?label=release&color=blue" alt="Release"></a>
  <img src="https://img.shields.io/badge/tauri-2.0-orange" alt="Tauri 2">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
</p>

---

Most AI code editors ship a bloated Electron app, phone home with your code, and charge a subscription. Clif is different — it's a ~20MB native binary built on Tauri 2 and Rust, your code never leaves your machine unless you choose a cloud model, and the whole thing is open source.

Monaco Editor gives you VS Code-quality editing. SolidJS keeps the UI reactive at ~7KB runtime. Rust handles file I/O, git, and PTY sessions without breaking a sweat.

## Quick Start

**From Release**

Download the latest `.dmg` from [Releases](https://github.com/DLhugly/Clif/releases), open it, drag to Applications.

**From Source**

```bash
git clone https://github.com/DLhugly/Clif.git
cd Clif
npm install
npm run tauri dev
```

> Requires: Node 22+, Rust 1.75+, Xcode CLT (macOS)

## Features

### Monaco Editor
Full VS Code editing engine — syntax highlighting for 70+ languages, IntelliSense, multi-cursor, minimap, bracket matching, code folding. Themed to match the rest of the UI.

### Integrated Terminal
Native PTY sessions via Rust's `portable-pty`. Real xterm.js terminal, not a fake shell. Supports your login shell, 256-color output, resize, scrollback. Run anything — build tools, git, Docker, Claude Code CLI.

### Dev Preview Panel
Run dev servers and preview your app without leaving the editor. Hot buttons for common commands (`npm run dev`, `npm start`), a mini terminal for server output, and a live iframe browser that auto-detects `localhost` URLs from terminal output.

### Git Integration
Built-in git powered by Rust — branch display, file status, staging/unstaging, commit, per-file diff stats (+/- line counts), and a visual commit graph. No shelling out to git from the frontend.

### Multi-AI Support
- **OpenRouter** — access Claude, GPT-4, Gemini, and 100+ models through one API
- **Ollama** — run models locally with zero cloud dependency
- **Claude Code CLI** — spawn Claude Code sessions directly from the terminal

### Privacy First
No telemetry. No cloud sync. No account required. Your code stays on your machine. AI features are opt-in — the editor works perfectly fine offline with zero API keys configured.

### 5 Themes
Midnight (dark blue), Graphite (warm dark), Dawn (light), Arctic (cool light), Dusk (purple dark). Applied consistently across the editor, terminal, and all UI panels.

### Keyboard-Driven
- `Ctrl+`` ` — toggle terminal
- `Ctrl+B` — toggle sidebar
- `Ctrl+S` — save file
- `Ctrl+Shift+P` — command palette

## Architecture

```
┌──────────────────────────────────────────────┐
│                  Tauri 2 Shell               │
│  ┌────────────┐  ┌────────────┐  ┌────────┐ │
│  │  File I/O  │  │  Git Ops   │  │  PTY   │ │
│  │  (Rust)    │  │  (Rust)    │  │ (Rust) │ │
│  └─────┬──────┘  └─────┬──────┘  └───┬────┘ │
│        │               │             │       │
│        └───────┬───────┴─────────────┘       │
│                │  IPC (invoke / events)       │
│        ┌───────┴───────────────────┐         │
│        │      SolidJS Frontend     │         │
│        │  ┌─────────┐ ┌─────────┐  │         │
│        │  │ Monaco  │ │ xterm.js│  │         │
│        │  │ Editor  │ │Terminal │  │         │
│        │  └─────────┘ └─────────┘  │         │
│        └───────────────────────────┘         │
└──────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| App shell | Tauri 2 (Rust) | ~20MB binary, native performance, secure IPC |
| Frontend | SolidJS + TypeScript | Reactive, ~7KB runtime, no virtual DOM |
| Editor | Monaco Editor | VS Code-quality editing out of the box |
| Terminal | xterm.js + portable-pty | Real PTY, real shell, real terminal |
| Styling | Tailwind CSS 4 | Utility-first, zero runtime |
| Build | Vite 6 | Fast HMR, optimized bundling |
| AI | OpenRouter / Ollama | Cloud or local, user's choice |
| CI/CD | Semantic Release + GitHub Actions | Automated versioning and macOS builds |

### Rust Backend Modules

| Module | Responsibility |
|--------|---------------|
| `commands/fs.rs` | File read/write/watch, directory operations |
| `commands/git.rs` | Status, diff, staging, commit, branches, log, numstat |
| `commands/pty.rs` | PTY spawn/write/resize/kill, session management |
| `commands/ai.rs` | OpenRouter + Ollama streaming, model listing |
| `commands/claude_code.rs` | Claude Code CLI subprocess management |
| `commands/search.rs` | Regex file search across project |
| `commands/settings.rs` | Persistent JSON settings store |
| `services/file_watcher.rs` | Filesystem change notifications via `notify` |

## Development

```bash
# Install dependencies
npm install

# Run in dev mode with hot reload
npm run tauri dev

# Check Rust compilation
cd src-tauri && cargo check

# Build production binary
npm run tauri build

# Bump version across all files
node scripts/bump-version.js 1.0.0
```

### Project Structure

```
src/                     # SolidJS frontend
├── components/
│   ├── editor/          # Monaco editor, tabs, diff view
│   ├── explorer/        # File tree
│   ├── layout/          # App shell, sidebar, top bar, dev preview
│   └── terminal/        # xterm.js terminal panel
├── stores/              # SolidJS reactive state
├── lib/                 # Tauri IPC wrappers, keybindings, themes
└── types/               # TypeScript interfaces

src-tauri/               # Rust backend
├── src/
│   ├── commands/        # Tauri IPC command handlers
│   └── services/        # File watcher, AI providers
└── tauri.conf.json      # App config, bundle settings
```

## Contributing

```bash
git clone https://github.com/DLhugly/Clif.git
cd Clif
npm install
npm run tauri dev
```

Use [conventional commits](https://www.conventionalcommits.org/) — semantic release auto-versions based on commit messages:

- `feat: add X` → minor version bump
- `fix: resolve Y` → patch version bump
- `feat!: breaking change` → major version bump

## License

[MIT](LICENSE)

---

<p align="center"><strong>Code fast. Stay private. Ship native.</strong></p>
