# Project Overview
ClifCode is a monorepo containing two products: **ClifPad** (a ~20MB native desktop IDE with built-in AI agents) and **ClifCode TUI** (a terminal AI coding agent). Both support any LLM via OpenRouter, OpenAI, Anthropic, or Ollama (fully local). No Electron, no telemetry, no subscription.

# Tech Stack
**ClifPad (Desktop IDE):**
- Tauri 2.2 (Rust backend)
- SolidJS 1.9.5 (frontend)
- TypeScript 5.7
- Monaco Editor 0.52.2
- xterm.js 6.0
- Tailwind CSS 4.1
- Vite 6.0
- Rust dependencies: reqwest, tokio, portable-pty, notify, walkdir

**ClifCode (Terminal Agent):**
- Rust 2021 edition
- ureq 2 (HTTP streaming)
- crossterm 0.28 (TUI)
- clap 4 (CLI)
- similar 2 (diff)
- npm distribution with platform-specific binaries

# Architecture
```
Clif-Code/
├── clif-pad-ide/           # Desktop IDE (Tauri 2 + SolidJS)
│   ├── src/                # Frontend: components/, stores/, lib/, types/
│   ├── src-tauri/src/      # Rust backend
│   │   ├── commands/       # Tauri commands (agent, ai, fs, git, pty, search, security)
│   │   ├── services/       # AI provider, file watcher
│   │   ├── lib.rs          # App setup, menu, event handlers
│   │   └── state.rs        # Shared app state
│   └── www/                # Landing page (clifcode.io)
├── clif-code-tui/          # Terminal agent (pure Rust)
│   ├── src/
│   │   ├── main.rs         # CLI, TUI loop, agent orchestration
│   │   ├── backend.rs      # API backends (OpenRouter, OpenAI, Ollama)
│   │   ├── tools.rs        # 9 tools (read, write, edit, search, find, list, run, cd, submit)
│   │   ├── ui.rs           # Terminal UI rendering
│   │   ├── session.rs      # Session persistence
│   │   ├── config.rs       # API keys, provider config
│   │   ├── git.rs          # Git integration
│   │   └── repomap.rs      # Workspace structure analysis
│   └── npm/                # npm distribution (6 platform binaries)
└── .github/workflows/      # CI/CD (semantic release, multi-platform builds)
```

# Key Files
- `clif-pad-ide/src/App.tsx` - Main app layout, keybindings, panel management
- `clif-pad-ide/src-tauri/src/commands/agent.rs` - AI agent sidebar tool execution
- `clif-pad-ide/src-tauri/src/commands/ai.rs` - Streaming AI chat
- `clif-pad-ide/src-tauri/src/commands/git.rs` - Git operations
- `clif-pad-ide/src-tauri/src/commands/pty.rs` - Terminal PTY management
- `clif-pad-ide/src-tauri/src/commands/security.rs` - Security scanner (secrets, vulnerabilities)
- `clif-code-tui/src/main.rs` - TUI entry point, agent loop
- `clif-code-tui/src/tools.rs` - Tool definitions (read, write, edit, etc.)
- `clif-code-tui/src/backend.rs` - Multi-provider LLM streaming
- `README.md` - Comprehensive user-facing documentation

# Build & Run
**ClifPad Desktop IDE:**
```bash
cd clif-pad-ide
npm install
npm run tauri dev          # Development mode
npm run tauri build        # Production build
```

**ClifCode Terminal Agent:**
```bash
cd clif-code-tui
cargo build --release
cargo run --release        # Run locally
cargo install --path .     # Install to ~/.cargo/bin
```

**Testing:**
```bash
# ClifPad: No test suite currently
# ClifCode: cargo test (if tests exist)
```

# Conventions
- **SolidJS**: Use `class=` not `className=`, JSX with `jsxImportSource: "solid-js"`
- **Stores**: Global state in `src/stores/` (uiStore, fileStore, gitStore, terminalStore, settingsStore)
- **Tauri Commands**: Define in `src-tauri/src/commands/*.rs` with `#[tauri::command]`, register in `lib.rs`
- **IPC Wrappers**: Frontend calls backend via `src/lib/tauri.ts`
- **Streaming**: AI responses streamed via Tauri events (`ai_stream`, `agent-stream`)
- **Semantic Versioning**: Conventional commits (`feat:` = minor bump, `fix:` = patch)
- **npm Distribution**: ClifCode TUI ships as 6 platform-specific packages under `@clifcode/cli-*`

# Important Notes
- **No Electron**: Both products use native tech (Tauri for desktop, pure Rust for TUI)
- **FSL-1.1-ALv2 License**: Free to use/modify/self-host, but cannot build competing commercial product. Converts to Apache 2.0 after 2 years.
- **Security Scanner**: Runs automatically before git commits in ClifPad, detects hardcoded secrets/keys
- **Context Compaction**: ClifCode TUI uses 3-tier automatic context management to run indefinitely without hitting limits
- **Auto-Update**: ClifPad has built-in updater (`tauri-plugin-updater`), ClifCode has `/update` command
- **macOS Gatekeeper**: Users may need to run `xattr -cr /Applications/ClifPad.app` after download
- **Monaco Setup**: Configure in `src/lib/monaco-setup.ts`, 70+ languages, IntelliSense, multi-cursor
- **PTY Management**: Native terminals via `portable-pty`, multiple tabs, stored in `PtyState`
- **Git Operations**: All implemented in Rust (branch, stage, commit, push/pull, diff, log)
- **AI Providers**: OpenRouter (default), OpenAI, Anthropic, Ollama (local), or any OpenAI-compatible endpoint
- **Theming**: 20 built-in themes, two-column picker split by dark/light
