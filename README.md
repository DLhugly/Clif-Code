<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo.svg">
    <source media="(prefers-color-scheme: light)" srcset="logo.svg">
    <img src="logo.svg" alt="ClifCode" width="600" />
  </picture>
</p>

<p align="center">
  <strong>~20MB desktop IDE. Terminal AI agent. Both native. Both open source.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/DLhugly/Clif-Code/releases"><img src="https://img.shields.io/github/v/release/DLhugly/Clif-Code?label=release&color=blue&style=flat-square" alt="Release"></a>
  <a href="https://www.npmjs.com/package/clifcode"><img src="https://img.shields.io/npm/v/clifcode?color=red&label=npm&style=flat-square" alt="npm"></a>
  <img src="https://img.shields.io/badge/binary-~20MB-ff6b6b?style=flat-square" alt="~20MB">
  <img src="https://img.shields.io/badge/runtime-7KB-51cf66?style=flat-square" alt="7KB runtime">
  <img src="https://img.shields.io/badge/tauri-2.0-orange?style=flat-square" alt="Tauri 2">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform">
</p>

<p align="center">
  <a href="https://clifcode.io">🌐 Website</a> &nbsp;·&nbsp;
  <a href="#-clifpad--download">🖥️ ClifPad</a> &nbsp;·&nbsp;
  <a href="#-clifcode--install">⚡ ClifCode</a> &nbsp;·&nbsp;
  <a href="#-development">🛠️ Development</a> &nbsp;·&nbsp;
  <a href="https://github.com/DLhugly/Clif-Code/releases">📦 Releases</a>
</p>

---

Cursor is 400MB. VS Code is 350MB. Zed doesn't do AI.

**Clif is ~20MB.** A native Rust binary with a 7KB SolidJS frontend. VS Code-quality editing via Monaco. Real terminal via PTY. Git built into the backend. AI when you want it, silence when you don't.

No Electron. No telemetry. No subscription. Open source.

<p align="center">
  <img src="SplashScreen.png" alt="ClifPad Screenshot" width="800" />
</p>

```
Clif-Code/
├── clif-pad-ide/    🖥️  Desktop IDE — Tauri 2 + SolidJS + Monaco
├── clif-code-tui/   ⚡  Terminal AI agent — pure Rust, any API
└── .github/         🔄  CI/CD (auto-release, npm publish)
```

---

## 🖥️ ClifPad — Download

<p align="center">
  <a href="https://github.com/DLhugly/Clif-Code/releases/download/v1.3.0/ClifPad_1.3.0_aarch64.dmg"><img src="https://img.shields.io/badge/macOS-Apple%20Silicon%20(.dmg)-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Apple Silicon"></a>
  &nbsp;
  <a href="https://github.com/DLhugly/Clif-Code/releases/download/v1.3.0/ClifPad_1.3.0_x64.dmg"><img src="https://img.shields.io/badge/macOS-Intel%20(.dmg)-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Intel"></a>
</p>

<p align="center">
  <a href="https://github.com/DLhugly/Clif-Code/releases/download/v1.3.0/ClifPad_1.3.0_x64-setup.exe"><img src="https://img.shields.io/badge/Windows-x64%20(.exe)-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows"></a>
  &nbsp;
  <a href="https://github.com/DLhugly/Clif-Code/releases/download/v1.3.0/ClifPad_1.3.0_amd64.deb"><img src="https://img.shields.io/badge/Linux-x64%20(.deb)-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux deb"></a>
  &nbsp;
  <a href="https://github.com/DLhugly/Clif-Code/releases/download/v1.3.0/ClifPad_1.3.0_amd64.AppImage"><img src="https://img.shields.io/badge/Linux-AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux AppImage"></a>
</p>

> [All releases & checksums](https://github.com/DLhugly/Clif-Code/releases)

### macOS — "App can't be opened"

Clif is open source but not yet notarized with Apple ($99/year). macOS blocks unsigned apps by default. This is normal for open source software — run one command to fix it:

```bash
xattr -cr /Applications/ClifPad.app
```

Then open ClifPad normally. This removes the quarantine flag that macOS sets on downloads. [Why does this happen?](#-faq)

**From source:**

```bash
git clone https://github.com/DLhugly/Clif-Code.git && cd Clif-Code
cd clif-pad-ide && npm install && npm run tauri dev
```

### ✨ Features

**📝 Monaco Editor** — 70+ languages, IntelliSense, multi-cursor, minimap, code folding. The same engine as VS Code.

**🖥️ Real Terminal** — Native PTY via Rust. Your actual shell with 256-color, resize, 10K scrollback. Not a simulation.

**🔍 Dev Preview** — One-click `npm run dev`, auto-detects `localhost` URLs, live iframe preview. Run and see your app without switching windows.

**🌿 Git** — Branch, status, stage, commit, per-file `+/-` diff stats, visual commit graph. All Rust, no shelling out.

**🤖 AI** — OpenRouter (Claude, GPT-4, Gemini, 100+ models), Ollama (fully local), Claude Code CLI. Ghost text completions. All opt-in. Works fine offline with zero keys.

**🎨 5 Themes** — Midnight, Graphite, Dawn, Arctic, Dusk. Editor, terminal, and UI stay in sync.

**⌨️ Keys** — `Ctrl+`` ` terminal, `Ctrl+B` sidebar, `Ctrl+S` save, `Ctrl+Shift+P` palette.

### 📊 The Size Flex

| | Binary | Runtime | RAM idle |
|---|--------|---------|----------|
| **ClifPad** | **~20MB** 🟢 | **7KB** 🟢 | **~80MB** 🟢 |
| Cursor | ~400MB 🔴 | ~50MB 🔴 | ~500MB+ 🔴 |
| VS Code | ~350MB 🔴 | ~40MB 🔴 | ~400MB+ 🔴 |
| Zed | ~100MB 🟡 | native | ~200MB 🟡 |

Tauri 2 compiles to a single native binary. SolidJS has no virtual DOM overhead. Rust handles all heavy lifting — file I/O, git, PTY, AI streaming — with zero garbage collection.

### 🏗️ Architecture

```
┌─────────────────────────────────────────┐
│             Tauri 2 (Rust)              │
│  File I/O · Git · PTY · AI · Search    │
│                  │                      │
│            IPC (invoke/events)          │
│                  │                      │
│           SolidJS + TypeScript          │
│       Monaco Editor · xterm.js          │
│           Tailwind CSS 4                │
└─────────────────────────────────────────┘
```

| Layer | Tech | Size |
|-------|------|------|
| Backend | Tauri 2 + Rust | ~20MB compiled |
| UI | SolidJS | 7KB runtime |
| Editor | Monaco | tree-shaken |
| Terminal | xterm.js + portable-pty | real PTY |
| Styles | Tailwind CSS 4 | zero runtime |
| Build | Vite 6 | <5s HMR |
| CI/CD | Semantic Release | auto-versioned |

---

## ⚡ ClifCode — Install

> **Open-source AI coding agent for your terminal. Like Claude Code — but you own it.**

```bash
npm i -g clifcode
```

That's it. Run `clifcode` in any project directory.

<details>
<summary><strong>Other install methods</strong></summary>

```bash
# Build from source
git clone https://github.com/DLhugly/Clif-Code.git && cd Clif-Code
cd clif-code-tui && cargo install --path .

# Or just run it directly
cd clif-code-tui && cargo run --release
```

</details>

### 🎬 How it looks

ClifCode is a tool-calling AI agent that reads your codebase, writes code, runs commands, searches files, and auto-commits — all from a beautiful TUI.

```
   _____ _ _  __ _____          _
  / ____| (_)/ _/ ____|        | |
 | |    | |_| || |     ___   __| | ___
 | |    | | |  _| |    / _ \ / _` |/ _ \
 | |____| | | | | |___| (_) | (_| |  __/
  \_____|_|_|_|  \_____\___/ \__,_|\___|

  AI coding assistant — works anywhere, ships fast

  ◆ Model  anthropic/claude-sonnet-4    ◆ Mode  auto-edit
  ◆ Path   ~/projects/my-app

  Type a task to get started, or /help for commands
  ─────────────────────────────────────────────

  ❯ refactor the auth module to use JWT tokens

  [1/7] ••• thinking
    ▶ read  src/auth/mod.rs
    ▶ read  src/auth/session.rs
    ◇ find  config.toml
    ✎ edit  src/auth/mod.rs  +42 -18
    ✎ edit  src/auth/session.rs  +15 -8
    ▸ run   cargo test
    ✓ All 23 tests passed

  ✦ ClifCode  Refactored auth module to use JWT tokens.
              Replaced session-based auth with stateless JWT
              verification. Added token expiry and refresh logic.

  ∙ 2.1k tokens  ∙ ~$0.0312
```

### 🛠️ Features

| | Feature | Details |
|---|---------|---------|
| 🔄 | **Agentic loop** | Up to 7 tool calls per turn — reads, writes, runs, searches, commits automatically |
| 🌐 | **Any provider** | OpenRouter, OpenAI, Anthropic, Ollama, or any OpenAI-compatible endpoint |
| ⚡ | **Parallel tools** | Read-only calls (file reads, searches) execute concurrently on threads |
| 📡 | **Streaming** | Responses render live with markdown formatting, code blocks, and syntax hints |
| 🎛️ | **3 autonomy modes** | `suggest` — confirm writes · `auto-edit` — apply with diffs · `full-auto` — hands-off |
| 💾 | **Sessions** | Auto-saves every conversation. Resume any session with `/resume` |
| 🔀 | **Auto-commit** | Commits changes with descriptive messages. One-command `/undo` |
| 💰 | **Cost tracking** | Per-turn and session-wide token usage with estimated cost |
| 🧠 | **Workspace intel** | Auto-scans project structure, reads README/Cargo.toml/package.json for context |
| 🔧 | **Non-interactive** | `clifcode -p "fix the bug"` for scripts and CI |

### 🔧 9 Built-in Tools

```
  ▶ read_file         Read files (with offset for large files)
  ✎ write_file        Create new files
  ✎ edit_file         Surgical find-and-replace with diff preview
  ◇ find_file         Locate files by name across the workspace
  ☰ list_files        Directory listing with structure
  ⌕ search            Regex search across your codebase
  ▸ run_command        Execute shell commands
  → change_directory   Switch workspace context
  ✓ submit            Signal task completion + auto-commit
```

### 💻 Usage

```bash
clifcode                                        # interactive, auto-detect backend
clifcode -p "explain this codebase"             # non-interactive single prompt
clifcode --backend api --api-model gpt-4o       # specific model
clifcode --backend ollama                       # local Ollama
clifcode --autonomy suggest                     # confirm every write
clifcode --resume                               # resume last session
```

### ⌨️ Commands

```
  ◆ Session     /new  /sessions  /resume  /cost  /clear  /quit
  ◆ Workspace   /cd   /add       /drop    /context
  ◆ Settings    /mode /backend   /config
  ◆ Git         /status  /undo
```

### 🔌 Supported Providers

| Provider | Config |
|----------|--------|
| **OpenRouter** (default) | `CLIFCODE_API_KEY` — access to 100+ models |
| **OpenAI** | `--api-url https://api.openai.com/v1` |
| **Anthropic** | Via OpenRouter or compatible proxy |
| **Ollama** | `--backend ollama` — fully local, no API key needed |
| **Any OpenAI-compatible** | `--api-url <your-endpoint>` |

---

## 🛠️ Development

```bash
# ClifPad — desktop IDE
cd clif-pad-ide
npm install && npm run tauri dev        # dev mode + hot reload
npm run tauri build                     # production binary

# ClifCode — terminal agent
cd clif-code-tui
cargo run --release                     # run directly
cargo install --path .                  # install to PATH
```

### Project Structure

```
clif-pad-ide/
├── src/                     # SolidJS frontend
│   ├── components/          # editor, terminal, layout, explorer
│   ├── stores/              # reactive state (signals + stores)
│   ├── lib/                 # IPC wrappers, keybindings, themes
│   └── types/               # TypeScript interfaces
├── src-tauri/src/           # Rust backend
│   ├── commands/            # fs, git, pty, ai, search, settings
│   └── services/            # file watcher, ai providers
└── www/                     # Landing page (clifcode.io)

clif-code-tui/
├── src/
│   ├── main.rs              # CLI, TUI loop, agent orchestration
│   ├── backend.rs           # API backend (OpenRouter, OpenAI, Ollama)
│   ├── tools.rs             # Tool definitions and execution
│   ├── ui.rs                # Terminal UI rendering
│   ├── session.rs           # Session persistence
│   ├── config.rs            # Config (API keys, provider setup)
│   ├── git.rs               # Git integration
│   └── repomap.rs           # Workspace structure analysis
├── npm/                     # npm distribution packages
│   ├── clifcode/            # Main wrapper (npm i -g clifcode)
│   └── @clifcode/cli-*/     # 6 platform-specific binaries
└── scripts/
    └── bump-version.js      # Syncs versions across Cargo.toml + npm
```

[Conventional commits](https://www.conventionalcommits.org/) — `feat:` bumps minor, `fix:` bumps patch, `feat!:` bumps major. Semantic release handles the rest.

---

## ❓ FAQ

**Why does macOS say "App can't be opened"?**
macOS Gatekeeper blocks apps that aren't signed with a $99/year Apple Developer certificate. ClifPad is open source and safe — run `xattr -cr /Applications/ClifPad.app` in Terminal to remove the quarantine flag, then open normally.

**Is Clif safe?**
100% open source. Read every line: [github.com/DLhugly/Clif-Code](https://github.com/DLhugly/Clif-Code). No telemetry, no network calls unless you enable AI. The `xattr` command just removes Apple's download flag — it doesn't disable any security.

**Why not just pay for code signing?**
We will. For now, the $99/year Apple Developer fee goes toward more important things. Proper signing + notarization is on the roadmap.

**Does it work offline?**
ClifPad: Yes — AI features are opt-in. Without API keys, it's a fully offline editor with terminal and git. ClifCode: Needs an API provider (but Ollama runs fully local with no internet).

**What models does ClifCode support?**
Any OpenAI-compatible API. Default is `anthropic/claude-sonnet-4` via OpenRouter. Also works with GPT-4o, Gemini, Llama, Qwen, Mistral, DeepSeek — anything on OpenRouter or Ollama.

---

## 📜 License

[MIT](LICENSE) — use it however you want.

<br>

<p align="center">
  <strong>20MB. Native. Private. Fast.</strong>
</p>

<p align="center">
  <sub>Built with 🦀 Rust and ❤️ by <a href="https://github.com/DLhugly">DLhugly</a></sub>
</p>
