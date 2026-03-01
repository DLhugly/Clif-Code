<p align="center">
  <img src="SplashScreen.png" alt="Clif-Code" width="800" />
</p>

<h1 align="center">Clif-Code</h1>

<p align="center">
  <strong>ClifPad: ~20MB desktop IDE. ClifCode: terminal AI agent.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://github.com/DLhugly/Clif-Code/releases"><img src="https://img.shields.io/github/v/release/DLhugly/Clif-Code?label=release&color=blue" alt="Release"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" alt="Platform">
</p>

<p align="center">
  <a href="https://clifcode.io">Website</a> &middot;
  <a href="#clifpad">ClifPad</a> &middot;
  <a href="#clifcode">ClifCode</a> &middot;
  <a href="#development">Development</a>
</p>

---

## Monorepo

```
Clif-Code/
├── clif-pad-ide/     # Desktop IDE (Tauri 2 + SolidJS + Monaco)
├── clif-code-tui/    # TUI terminal agent (Rust, API-only)
└── .github/          # CI/CD
```

---

## ClifPad

A blazing-fast, privacy-first, open-source AI-native code editor. ~20MB native binary, 7KB SolidJS frontend.

**Tech**: Tauri 2 (Rust) + SolidJS + Monaco Editor + Tailwind CSS 4

### Features

- **Monaco Editor** — 70+ languages, IntelliSense, multi-cursor, minimap, code folding
- **Real Terminal** — Native PTY via Rust, 256-color, resize, 10K scrollback
- **Dev Preview** — One-click dev server with live iframe preview
- **Git** — Branch, status, stage, commit, diff stats, visual commit graph
- **AI** — OpenRouter, Ollama (local), Claude Code CLI — all opt-in
- **5 Themes** — Midnight, Graphite, Dawn, Arctic, Dusk

### Install

Download from [Releases](https://github.com/DLhugly/Clif-Code/releases) or build from source:

```bash
cd clif-pad-ide
npm install && npm run tauri dev
```

> **macOS "App can't be opened"** — Run `xattr -cr /Applications/ClifPad.app` to remove the quarantine flag.

---

## ClifCode

AI coding assistant TUI that runs in any terminal. Supports OpenRouter, OpenAI, Anthropic, Ollama, and any OpenAI-compatible API.

### Features

- **Tool-calling agent loop** — read/write files, run commands, search, git ops
- **Streaming markdown** — line-buffered rendering with syntax highlighting
- **Parallel tools** — read-only calls execute concurrently
- **Session persistence** — auto-saves, resume previous sessions
- **Cost tracking** — per-turn and session token usage

### Install

```bash
npm i -g clifcode
```

Or build from source:

```bash
cd clif-code-tui
cargo install --path .
```

### Usage

```bash
clifcode                                    # auto-detect backend
clifcode --backend api --api-model gpt-4o   # specific API model
clifcode --backend ollama                   # local Ollama server
```

---

## Development

```bash
# ClifPad
cd clif-pad-ide && npm install && npm run tauri dev

# ClifCode
cd clif-code-tui && cargo run --release
```

[Conventional commits](https://www.conventionalcommits.org/) — `feat:` bumps minor, `fix:` bumps patch, `feat!:` bumps major.

## License

[MIT](LICENSE)
