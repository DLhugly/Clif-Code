<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="logo.svg">
    <source media="(prefers-color-scheme: light)" srcset="logo.svg">
    <img src="logo.svg" alt="ClifCode" width="600" />
  </picture>
</p>

<p align="center">
  <strong>~20MB native code editor with built-in AI agents. Open source.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/DLhugly/Clif-Code/releases"><img src="https://img.shields.io/github/v/release/DLhugly/Clif-Code?label=release&color=blue&style=flat-square" alt="Release"></a>
  <a href="https://crates.io/crates/clifcode"><img src="https://img.shields.io/crates/v/clifcode?color=e6522c&style=flat-square" alt="crates.io"></a>
  <a href="https://www.npmjs.com/package/clifcode"><img src="https://img.shields.io/npm/v/clifcode?color=red&label=npm&style=flat-square" alt="npm"></a>
  <a href="https://www.npmjs.com/package/clifcode"><img src="https://img.shields.io/npm/dm/clifcode?color=cb3837&label=npm%20downloads&style=flat-square" alt="npm downloads"></a>
  <a href="https://github.com/DLhugly/Clif-Code/stargazers"><img src="https://img.shields.io/github/stars/DLhugly/Clif-Code?style=flat-square&color=yellow" alt="GitHub Stars"></a>
  <img src="https://img.shields.io/badge/binary-~20MB-ff6b6b?style=flat-square" alt="~20MB">
  <img src="https://img.shields.io/badge/tauri-2.0-orange?style=flat-square" alt="Tauri 2">
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey?style=flat-square" alt="Platform">
</p>

<p align="center">
  <a href="https://clifcode.io">Website</a> &nbsp;&middot;&nbsp;
  <a href="#-get-it">Get It</a> &nbsp;&middot;&nbsp;
  <a href="#-clifpad">ClifPad</a> &nbsp;&middot;&nbsp;
  <a href="#-clifcode">ClifCode</a> &nbsp;&middot;&nbsp;
  <a href="#-build--contribute">Development</a> &nbsp;&middot;&nbsp;
  <a href="https://github.com/DLhugly/Clif-Code/releases">Releases</a>
</p>

---

Cursor is 400MB. VS Code is 350MB. Zed is 100MB and climbing.

**ClifPad is ~20MB.** A native Rust IDE with a 7KB SolidJS frontend. VS Code-quality editing via Monaco. Real terminal via PTY. Git built into the backend. AI via [ClifCode](#-clifcode) and [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) — both integrated, both optional.

No Electron. No telemetry. No subscription. Open source.

<p align="center">
  <img src="SplashScreen.png" alt="ClifPad Screenshot" width="800" />
</p>

---

## 📦 Get It

<table>
<tr>
<td width="50%" valign="top">

### ClifPad — Desktop IDE

<p>
  <a href="https://github.com/DLhugly/Clif-Code/releases/download/v1.4.0/ClifPad_1.4.0_aarch64.dmg"><img src="https://img.shields.io/badge/macOS-Apple%20Silicon%20(.dmg)-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Apple Silicon"></a>
  <a href="https://github.com/DLhugly/Clif-Code/releases/download/v1.4.0/ClifPad_1.4.0_x64.dmg"><img src="https://img.shields.io/badge/macOS-Intel%20(.dmg)-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Intel"></a>
</p>
<p>
  <a href="https://github.com/DLhugly/Clif-Code/releases/download/v1.4.0/ClifPad_1.4.0_x64-setup.exe"><img src="https://img.shields.io/badge/Windows-x64%20(.exe)-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows"></a>
  <a href="https://github.com/DLhugly/Clif-Code/releases/download/v1.4.0/ClifPad_1.4.0_amd64.deb"><img src="https://img.shields.io/badge/Linux-.deb-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux deb"></a>
  <a href="https://github.com/DLhugly/Clif-Code/releases/download/v1.4.0/ClifPad_1.4.0_amd64.AppImage"><img src="https://img.shields.io/badge/Linux-AppImage-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Linux AppImage"></a>
</p>

> **macOS "App can't be opened"?** — Run `xattr -cr /Applications/ClifPad.app` then open normally. [Why?](#-faq)

</td>
<td width="50%" valign="top">

### ClifCode — Terminal Agent

```bash
cargo install clifcode
```

```bash
npm i -g clifcode
```

Run `clifcode` in any project directory. That's it.

<details>
<summary>Other install methods</summary>

```bash
# Or clone and build locally
git clone https://github.com/DLhugly/Clif-Code.git
cd Clif-Code/clif-code-tui && cargo install --path .
```

</details>

</td>
</tr>
</table>

> [All releases & checksums](https://github.com/DLhugly/Clif-Code/releases)

---

## 🖥️ ClifPad

**📝 Monaco Editor** — 70+ languages, IntelliSense, multi-cursor, minimap, code folding. Same engine as VS Code.

**🖥️ Real Terminal** — Native PTY via Rust. Your actual shell with 256-color, resize, 10K scrollback.

**🔍 Dev Preview** — One-click `npm run dev`, auto-detects `localhost`, live iframe preview.

**🌿 Git** — Branch, status, stage, commit, per-file `+/-` diff stats, visual commit graph. All Rust.

**🤖 AI Agents** — Built-in support for [ClifCode](#-clifcode) (our open-source TUI agent) and [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview). Also connects to OpenRouter (100+ models) and Ollama (fully local). Ghost text completions. All opt-in.

**🎨 5 Themes** — Midnight, Graphite, Dawn, Arctic, Dusk. Editor, terminal, and UI stay in sync.

**⌨️ Keys** — `Ctrl+`` ` terminal, `Ctrl+B` sidebar, `Ctrl+S` save, `Ctrl+Shift+P` palette.

### 📊 The Size Flex

| | Binary | Runtime | RAM idle |
|---|--------|---------|----------|
| **ClifPad** | **~20MB** | **7KB** | **~80MB** |
| Cursor | ~400MB | ~50MB | ~500MB+ |
| VS Code | ~350MB | ~40MB | ~400MB+ |
| Zed | ~100MB | native | ~200MB |

Tauri 2 compiles to a single native binary. SolidJS has no virtual DOM overhead. Rust handles file I/O, git, PTY, AI streaming — zero garbage collection.

---

## ⚡ ClifCode

> **The open-source AI agent that powers ClifPad's AI — and works as a standalone terminal tool.**
>
> Like Claude Code, but you own it, configure it, and run it with any LLM.

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

**What it does:** Tool-calling AI agent that reads your codebase, writes code, runs commands, searches files, and auto-commits — all from a TUI. Bring your own API key, use any LLM, or run fully local with Ollama.

### 🔧 9 Built-in Tools

| Tool | Description |
|------|-------------|
| **read_file** | Read file contents with offset support for large files |
| **write_file** | Create or overwrite files, auto-creates directories, shows diff |
| **edit_file** | Targeted string replacement with fuzzy matching fallback (60%+ similarity) |
| **find_file** | Recursive file search by name (5 levels deep, top 30 results) |
| **search** | Grep-based pattern search across 15+ file types |
| **list_files** | Tree view directory listing (3 levels, 200 entry max) |
| **run_command** | Execute shell commands in workspace context |
| **change_directory** | Switch workspace, auto-updates repo map |
| **submit** | Mark task complete, triggers git auto-commit |

### 🎛️ 3 Autonomy Modes

| Mode | Behavior |
|------|----------|
| **suggest** | Shows diff, prompts Y/n before every write |
| **auto-edit** (default) | Applies changes automatically, shows collapsed diff (Ctrl+O to expand) |
| **full-auto** | Hands-off — applies all changes silently |

### ✨ Feature Highlights

| Feature | Details |
|---------|---------|
| **Agentic loop** | Up to 7 tool calls per turn with chained reasoning |
| **Parallel tools** | Read-only calls execute concurrently on threads |
| **Session persistence** | Auto-saves every conversation — resume any session by ID |
| **Git auto-commit** | Commits on task completion — author: `ClifCode <clifcode@local>`, undo with `/undo` |
| **Repo mapping** | Auto-generates directory tree (4 levels deep) injected into context |
| **Auto-context** | Reads README, Cargo.toml, package.json, pyproject.toml, go.mod, Dockerfile, .clifcode.toml, etc. |
| **Smart compaction** | 3-tier context management: truncate large results → stub old results → drop old turns |
| **Fuzzy edit matching** | When exact match fails, line-based sliding window with 60%+ similarity threshold |
| **Cost tracking** | Per-turn token usage and estimated cost displayed inline |
| **Streaming markdown** | Live token-by-token rendering with code block detection |
| **npm distribution** | 6 platform binaries: macOS/Linux/Windows × x64/ARM64 |

### 📋 Slash Commands

```
◆ Session     /new  /sessions  /resume [id]  /cost  /clear  /quit
◆ Workspace   /cd   /add       /drop         /context
◆ Settings    /mode /backend   /config
◆ Git         /status  /undo
◆ Help        /help
```

| Command | What it does |
|---------|-------------|
| `/new` | Start a fresh conversation |
| `/sessions` | List all saved sessions with date and preview |
| `/resume [id]` | Resume a saved session (interactive picker if no ID) |
| `/cost` | Show session token usage and estimated cost |
| `/mode` | Switch between suggest / auto-edit / full-auto |
| `/backend` | Show current provider and model |
| `/config` | Re-run provider setup wizard |
| `/cd [dir]` | Change workspace directory |
| `/add <file>` | Add file to persistent context |
| `/drop <file>` | Remove file from context |
| `/context` | Show conversation messages and context files |
| `/status` | Show `git status --short` |
| `/undo` | Soft-reset last ClifCode commit (keeps changes staged) |

### 🔌 Providers

| Provider | Setup | Default Model |
|----------|-------|---------------|
| **OpenRouter** (default) | `CLIFCODE_API_KEY` | `anthropic/claude-sonnet-4` |
| **OpenAI** | `--api-url https://api.openai.com/v1` | `gpt-4o` |
| **Anthropic** | `--api-url https://api.anthropic.com/v1` | `claude-sonnet-4-20250514` |
| **Ollama** | `--backend ollama` (no API key needed) | `qwen2.5-coder:7b` |
| **Any OpenAI-compatible** | `--api-url <endpoint>` | user-specified |

### 🚩 CLI Flags

```bash
clifcode                                          # interactive mode
clifcode -p "explain this codebase"               # non-interactive single prompt
clifcode --backend ollama                         # use local models
clifcode --autonomy suggest                       # confirm every write
clifcode --resume                                 # resume last session
clifcode --resume <session-id>                    # resume specific session
clifcode -w /path/to/project                      # set workspace
clifcode --api-model gpt-4o --api-url https://api.openai.com/v1  # custom provider
clifcode --max-tokens 2048                        # max completion tokens
```

| Flag | Env Variable | Default |
|------|-------------|---------|
| `--backend <auto\|api\|ollama\|stub>` | — | `auto` |
| `--api-url <url>` | `CLIFCODE_API_URL` | OpenRouter |
| `--api-key <key>` | `CLIFCODE_API_KEY` | — |
| `--api-model <name>` | `CLIFCODE_API_MODEL` | `anthropic/claude-sonnet-4` |
| `--workspace, -w <path>` | — | current directory |
| `--max-tokens <n>` | — | `1024` |
| `--prompt, -p <text>` | — | — |
| `--autonomy <mode>` | — | `auto-edit` |
| `--resume [id]` | — | — |

### ⚔️ Why ClifCode?

| | ClifCode | Claude Code | Aider |
|---|:---:|:---:|:---:|
| **Open source** | ✅ MIT | ✅ Apache-2.0 | ✅ Apache-2.0 |
| **Any LLM provider** | ✅ 100+ via OpenRouter | Anthropic only | ✅ Multi-provider |
| **Local models (Ollama)** | ✅ | ❌ | ✅ |
| **Tool-calling agent** | ✅ 9 tools | ✅ | ❌ diff-based |
| **Session persistence** | ✅ Resume any | ✅ | ❌ |
| **Git auto-commit** | ✅ | ✅ | ✅ |
| **TUI interface** | ✅ | ✅ | ✅ |
| **Cost tracking** | ✅ Per-turn | ✅ | ✅ |
| **Runtime** | Rust (native binary) | Node.js | Python |
| **No subscription** | ✅ BYO key | API costs | ✅ BYO key |

ClifCode gives you the agentic tool-calling experience of Claude Code with the provider freedom of Aider — in a single native Rust binary.

---

## 🛠️ Build & Contribute

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

### Architecture

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

### Project Structure

```
Clif-Code/
├── clif-pad-ide/    🖥️  Desktop IDE — Tauri 2 + SolidJS + Monaco
├── clif-code-tui/   ⚡  Terminal AI agent — pure Rust, any API
└── .github/         🔄  CI/CD (auto-release, npm publish)
```

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
Any model accessible through an OpenAI-compatible API. Default is `anthropic/claude-sonnet-4` via OpenRouter, which gives access to 100+ models including GPT-4o, Gemini, Llama, Qwen, Mistral, and DeepSeek. Use `--backend ollama` for fully local inference with any Ollama-supported model.

**How does ClifCode compare to Claude Code / Aider?**
ClifCode is a tool-calling agent (like Claude Code) that works with any LLM provider (like Aider). It combines the agentic loop and tool-calling architecture of Claude Code with the provider flexibility of Aider — in a single native Rust binary with no Node.js or Python runtime. See the [comparison table](#-why-clifcode) for details.

---

## 📜 License

[MIT](LICENSE) — use it however you want.

<br>

<p align="center">
  <strong>20MB. Native. Private. Fast.</strong>
</p>

<p align="center">
  <sub>Built with Rust and care by <a href="https://github.com/DLhugly">DLhugly</a></sub>
</p>
