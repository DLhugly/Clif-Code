<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo.svg">
    <source media="(prefers-color-scheme: light)" srcset="logo.svg">
    <img src="logo.svg" alt="ClifCode" width="600" />
  </picture>
</p>

<p align="center">
  <strong>Desktop IDE + Terminal Agent. Both native. Both open source.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/DLhugly/Clif-Code/releases"><img src="https://img.shields.io/github/v/release/DLhugly/Clif-Code?label=release&color=blue&style=flat-square" alt="Release"></a>
  <a href="https://www.npmjs.com/package/clifcode"><img src="https://img.shields.io/npm/v/clifcode?color=red&label=npm&style=flat-square" alt="npm"></a>
  <img src="https://img.shields.io/badge/rust-stable-orange?style=flat-square" alt="Rust">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform">
</p>

<p align="center">
  <a href="https://clifcode.io">🌐 Website</a> &nbsp;·&nbsp;
  <a href="#-clifpad">🖥️ ClifPad</a> &nbsp;·&nbsp;
  <a href="#-clifcode">⚡ ClifCode</a> &nbsp;·&nbsp;
  <a href="#-quick-start">🚀 Quick Start</a> &nbsp;·&nbsp;
  <a href="https://github.com/DLhugly/Clif-Code/releases">📦 Downloads</a>
</p>

<br>

<p align="center">
  <img src="SplashScreen.png" alt="ClifPad Screenshot" width="800" />
</p>

<br>

---

## 🧬 What is Clif?

Clif is a monorepo with **two products** that share one philosophy: coding tools should be **fast**, **private**, and **yours**.

```
Clif-Code/
├── clif-pad-ide/    🖥️  Desktop IDE — Tauri 2 + SolidJS + Monaco
├── clif-code-tui/   ⚡  Terminal AI agent — pure Rust, any API
└── .github/         🔄  CI/CD (auto-release, npm publish)
```

<table>
<tr>
<td align="center" width="50%">

### 🖥️ ClifPad
**~20MB** native desktop editor<br>
Monaco · Terminal · Git · AI · 5 Themes<br>
<sub>Tauri 2 (Rust) + SolidJS + Tailwind CSS 4</sub><br><br>
<a href="https://github.com/DLhugly/Clif-Code/releases"><strong>⬇️ Download</strong></a>

</td>
<td align="center" width="50%">

### ⚡ ClifCode
**AI agent** in your terminal<br>
9 tools · sessions · auto-commit · streaming<br>
<sub>Pure Rust · OpenRouter · OpenAI · Ollama</sub><br><br>
<code>npm i -g clifcode</code>

</td>
</tr>
</table>

<br>

> **Why not Cursor / VS Code / Zed?**
>
> | | Clif | Cursor | VS Code | Zed |
> |---|:---:|:---:|:---:|:---:|
> | **Binary size** | **~20MB** 🟢 | ~400MB 🔴 | ~350MB 🔴 | ~100MB 🟡 |
> | **UI runtime** | **7KB** (SolidJS) | Electron | Electron | GPU |
> | **RAM at idle** | **~80MB** | ~500MB+ | ~400MB+ | ~150MB |
> | **Telemetry** | **Zero** | Yes | Yes | Yes |
> | **Subscription** | **None** | $20/mo | Free* | Free* |
> | **Open source** | **MIT** | No | Partial | Yes |

<br>

---

## 🖥️ ClifPad

> **VS Code features at 1/20th the size. No Electron. No telemetry. No subscription.**

A native desktop code editor built with Tauri 2 (Rust) and SolidJS. The same Monaco engine that powers VS Code — wrapped in a binary that launches instantly and barely touches your RAM.

### ✨ Features

| | Feature | Details |
|---|---------|---------|
| 📝 | **Monaco Editor** | 70+ languages, IntelliSense, multi-cursor, minimap, bracket matching, code folding |
| 🖥️ | **Real Terminal** | Native PTY via Rust — your actual shell with 256-color, resize, 10K scrollback |
| 🔍 | **Dev Preview** | One-click dev server, auto-detects localhost, live iframe preview |
| 🌿 | **Git Integration** | Branch, stage, commit, per-file diff stats, visual commit graph — all in Rust |
| 🤖 | **AI (opt-in)** | OpenRouter (100+ models), Ollama (local), Claude Code CLI, ghost text completions |
| 🎨 | **5 Themes** | Midnight · Graphite · Dawn · Arctic · Dusk |

### 📦 Install

**Download** from [Releases](https://github.com/DLhugly/Clif-Code/releases) — available for macOS (Apple Silicon + Intel), Windows, and Linux.

Or build from source:

```bash
git clone https://github.com/DLhugly/Clif-Code.git
cd Clif-Code/clif-pad-ide
npm install && npm run tauri dev
```

> [!NOTE]
> **macOS "App can't be opened"** — Run `xattr -cr /Applications/ClifPad.app` to remove the quarantine flag. This is standard for unsigned open-source apps. Notarization is on the roadmap.

<br>

---

## ⚡ ClifCode

> **Open-source AI coding agent for your terminal. Like Claude Code — but you own it.**

ClifCode is a tool-calling AI agent that reads your codebase, writes code, runs commands, searches files, and auto-commits — all from a beautiful TUI. Works with **any** OpenAI-compatible API.

### 🚀 Get started

```bash
npm i -g clifcode
```

That's it. Run `clifcode` in any project directory.

<details>
<summary><strong>Other install methods</strong></summary>

```bash
# Build from source
cd clif-code-tui && cargo install --path .

# Or just run it
cd clif-code-tui && cargo run --release
```

</details>

### 🎬 How it looks

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
| **Ollama** | `--backend ollama` — runs fully local, no API key needed |
| **Any OpenAI-compatible** | `--api-url <your-endpoint>` |

<br>

---

## 🚀 Quick Start

```bash
# Clone the monorepo
git clone https://github.com/DLhugly/Clif-Code.git && cd Clif-Code
```

**ClifPad** (desktop IDE):
```bash
cd clif-pad-ide && npm install && npm run tauri dev
```

**ClifCode** (terminal agent):
```bash
cd clif-code-tui && cargo run --release
```

**Or install ClifCode globally:**
```bash
npm i -g clifcode && clifcode
```

### Requirements

| | ClifPad | ClifCode |
|---|---------|----------|
| **Language** | Rust + TypeScript | Rust |
| **Runtime** | Node 18+, Rust stable | Rust stable |
| **Install** | [Download binary](https://github.com/DLhugly/Clif-Code/releases) | `npm i -g clifcode` |
| **Binary size** | ~20MB | ~5MB |
| **AI required?** | No (opt-in) | Yes (any provider) |

<br>

---

## 🤝 Contributing

We use [conventional commits](https://www.conventionalcommits.org/):

- `feat:` — new feature (bumps minor)
- `fix:` — bug fix (bumps patch)
- `feat!:` — breaking change (bumps major)

The codebase is intentionally small. ClifPad's frontend is ~2K lines of SolidJS. ClifCode's agent is ~1K lines of Rust. You can read and understand either project in an afternoon.

**PRs welcome.**

## 📜 License

[MIT](LICENSE) — use it however you want.

<br>

<p align="center">
  <sub>Built with 🦀 Rust and ❤️ by <a href="https://github.com/DLhugly">DLhugly</a></sub>
</p>
