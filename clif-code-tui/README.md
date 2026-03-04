# ClifCode

**The open-source AI agent that powers [ClifPad](https://github.com/DLhugly/Clif-Code) — and works as a standalone terminal tool.**

Like Claude Code, but you own it, configure it, and run it with any LLM.

```
   _____ _ _  __ _____          _
  / ____| (_)/ _/ ____|        | |
 | |    | |_| || |     ___   __| | ___
 | |    | | |  _| |    / _ \ / _` |/ _ \
 | |____| | | | | |___| (_) | (_| |  __/
  \_____|_|_|_|  \_____\___/ \__,_|\___|

  ◆ Model  anthropic/claude-sonnet-4    ◆ Mode  auto-edit
  ◆ Path   ~/projects/my-app

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

  ∙ 2.1k tokens  ∙ ~$0.0312
```

## Install

```bash
cargo install clifcode
```

```bash
npm i -g clifcode
```

Prebuilt binaries for macOS, Linux, and Windows (x64 + ARM64) via npm.

## Features

- **9 built-in tools** — read, write, edit, find, search, list, run, cd, submit
- **Agentic loop** — up to 7 chained tool calls per turn
- **Any LLM** — OpenRouter (100+ models), OpenAI, Anthropic, Ollama, or any OpenAI-compatible API
- **3 autonomy modes** — suggest (confirm writes), auto-edit (default), full-auto (hands-off)
- **Session persistence** — auto-saves every conversation, resume any session
- **Git auto-commit** — commits on task completion, undo with `/undo`
- **Repo mapping** — auto-generates directory tree and reads project config files for context
- **Smart context compaction** — 3-tier system keeps conversations within token limits
- **Fuzzy edit matching** — falls back to similarity-based matching when exact match fails
- **Cost tracking** — per-turn token usage and estimated cost
- **Parallel tools** — read-only calls execute concurrently on threads
- **Streaming markdown** — live token-by-token rendering

## Quick Start

```bash
# Set your API key (OpenRouter default)
export CLIFCODE_API_KEY=sk-or-...

# Start interactive mode
clifcode

# Or one-shot prompt
clifcode -p "add error handling to the API routes"

# Use local models (no API key needed)
clifcode --backend ollama

# Resume last session
clifcode --resume
```

## Provider Setup

| Provider | Setup | Default Model |
|----------|-------|---------------|
| **OpenRouter** (default) | `CLIFCODE_API_KEY` | `anthropic/claude-sonnet-4` |
| **OpenAI** | `--api-url https://api.openai.com/v1` | `gpt-4o` |
| **Anthropic** | `--api-url https://api.anthropic.com/v1` | `claude-sonnet-4-20250514` |
| **Ollama** | `--backend ollama` | `qwen2.5-coder:7b` |
| **Any OpenAI-compatible** | `--api-url <endpoint>` | user-specified |

## Commands

```
◆ Session     /new  /sessions  /resume [id]  /cost  /clear  /quit
◆ Workspace   /cd   /add       /drop         /context
◆ Settings    /mode /backend   /config
◆ Git         /status  /undo
◆ Help        /help
```

## CLI Flags

```bash
clifcode                                          # interactive mode
clifcode -p "explain this codebase"               # non-interactive
clifcode --backend ollama                         # local models
clifcode --autonomy suggest                       # confirm every write
clifcode --resume                                 # resume last session
clifcode -w /path/to/project                      # set workspace
clifcode --api-model gpt-4o --api-url https://api.openai.com/v1
```

## Part of the Clif Monorepo

ClifCode is the AI agent that powers [ClifPad](https://github.com/DLhugly/Clif-Code), a ~20MB native desktop IDE built with Tauri 2, SolidJS, and Monaco Editor. ClifCode is integrated into ClifPad as an AI backend (alongside Claude Code), but also works great as a standalone terminal tool.

## License

[MIT](../LICENSE)
