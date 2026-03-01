# Clif-Code Monorepo

Two products in one repo:

## ClifPad (`clif-pad-ide/`)
Desktop AI-native code editor — Tauri 2 + SolidJS + Monaco Editor.

**Tech**: Tauri 2 (Rust), SolidJS, TypeScript, Monaco, Tailwind CSS 4, Vite 6
**AI**: OpenRouter API, Ollama, Claude Code CLI

```
cd clif-pad-ide && npm install && npm run tauri dev
```

### Layout
- `clif-pad-ide/src/` — SolidJS frontend (components, stores, types)
- `clif-pad-ide/src-tauri/` — Rust backend (commands, services, state)
- `clif-pad-ide/www/` — Landing page (clifcode.io, deployed via Vercel)
- `clif-pad-ide/scripts/` — Version bump script

### Conventions
- SolidJS: `class=` not `className=`, stores in `src/stores/`
- Tauri commands in `src-tauri/src/commands/`, IPC wrappers in `src/lib/tauri.ts`
- AI streaming via Tauri events ("ai_stream", "claude-code-output")

## ClifCode (`clif-code-tui/`)
TUI terminal agent — Rust, API-only (no local model inference).

```
cd clif-code-tui && cargo run --release
```

### Layout
- `clif-code-tui/src/main.rs` — CLI, TUI loop, agent orchestration
- `clif-code-tui/src/backend.rs` — API backend (OpenRouter, OpenAI, Ollama)
- `clif-code-tui/src/tools.rs` — Tool definitions and execution
- `clif-code-tui/src/ui.rs` — Terminal UI rendering
- `clif-code-tui/src/session.rs` — Session persistence
- `clif-code-tui/src/config.rs` — Config (API keys, provider setup)
- `clif-code-tui/src/git.rs` — Git integration
- `clif-code-tui/src/repomap.rs` — Workspace structure analysis

### npm Distribution (`clif-code-tui/npm/`)
- `clif-code-tui/npm/clifcode/` — Main wrapper package (`npm i -g clifcode`)
- `clif-code-tui/npm/@clifcode/cli-*` — Platform-specific binary packages
- `clif-code-tui/scripts/bump-version.js` — Syncs version across Cargo.toml + npm packages

## CI/CD
- `.github/workflows/release.yml` — Semantic release + multi-platform ClifPad builds
- `.github/workflows/clifcode-release.yml` — ClifCode TUI builds + npm publish
- Vercel deploys `clif-pad-ide/www/` to clifcode.io
