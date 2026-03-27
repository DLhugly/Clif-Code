# ClifPad Panel Layout System

## New Simplified Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  TopBar: [Agent] [Files] [Browser] [Theme] [Security]           │
├─────────────┬─────────────────────────────┬────────────────────┤
│             │                             │                    │
│  Terminal   │         Editor              │    Files/Git       │
│             │         (Monaco)            │                    │
│  (xterm.js) │                             │    (RightSidebar)  │
│             │                             │                    │
│             │                             │                    │
│  [tabs]     │                             │    [Files] [Git]   │
│             │                             │                    │
│             │                             │    OR              │
│             │                             │                    │
│             │                             │    Agent Panel     │
│             │                             │    (AI Chat)       │
│             │                             │                    │
├─────────────┴─────────────────────────────┴────────────────────┤
│  StatusBar: [Terminal] [Git] [Editor] | [Agent] [Version]      │
└─────────────────────────────────────────────────────────────────┘
```

## Panel States

Each panel can be independently toggled:

| Panel    | Toggle Location    | Default State | Purpose                          |
|----------|-------------------|---------------|----------------------------------|
| Terminal | StatusBar (left)  | ✅ Visible    | Integrated shell, multiple tabs  |
| Editor   | StatusBar (mid)   | ✅ Visible    | Monaco code editor               |
| Files    | TopBar (right)    | ✅ Visible    | File tree + Git operations       |
| Agent    | TopBar/StatusBar  | ❌ Hidden     | AI coding assistant chat         |

## Flexible Layouts

Users can create any combination:

### Default (3-panel)
```
[Terminal] [Editor] [Files]
```

### Agent Mode (3-panel)
```
[Terminal] [Editor] [Agent]
```

### Minimal (2-panel)
```
[Terminal] [Editor]
```
or
```
[Editor] [Files]
```

### Zen Mode (1-panel)
```
[Editor]
```

### Full Productivity (4-panel)
```
[Terminal] [Editor] [Files + Agent visible simultaneously]
```
Note: Since Agent and Files share the right space, only one is visible at a time. Toggle between them with TopBar/StatusBar buttons.

## Panel Controls

### TopBar (Right Section)
- **Agent Button** - Toggle AI chat panel on/off
- **Files Button** - Toggle file explorer/git panel on/off

### StatusBar
- **Left**: Terminal toggle, Git status, Launch buttons
- **Middle**: Editor toggle, Language indicator
- **Right**: Agent toggle, Version info

## Keyboard Shortcuts (can be registered)

Suggested shortcuts in keybindings:
- `Ctrl/Cmd + ~` - Toggle Terminal
- `Ctrl/Cmd + B` - Toggle Files
- `Ctrl/Cmd + .` - Toggle Agent
- `Ctrl/Cmd + Shift + E` - Toggle Editor

## Resizing

All panels support drag-to-resize:
- **Terminal**: Drag right edge to resize width (20-80%)
- **Files/Agent**: Drag left edge to resize width (180-500px)
- **Agent**: Can be wider than Files (280-full width minus 100px)

Panel sizes are **persistent** across sessions (stored in uiStore signals).

## State Management

### Core State (uiStore)
```typescript
visiblePanels: Set<Panel> = Set(["terminal", "files", "editor"])
terminalWidth: number = 50  // percentage
sidebarWidth: number = 240  // pixels
agentWidth: number = 380    // pixels
```

### Derived (computed on demand)
```typescript
terminalVisible() = visiblePanels.has("terminal")
filesVisible() = visiblePanels.has("files")  
agentVisible() = visiblePanels.has("agent")
editorVisible() = visiblePanels.has("editor")
```

## Architecture Benefits

1. **No conflicts** - Single source of truth eliminates race conditions
2. **Easy debugging** - Check one place: `visiblePanels()`
3. **Predictable** - Same action always produces same result
4. **Flexible** - Any combination of panels can be shown
5. **Clean** - Removed 200+ lines of preset management code

## Migration from Old System

The old preset system (`"default"`, `"agent-mode"`, `"terminal-only"`, etc.) has been removed. Users now have **more control** with simpler toggle buttons instead of having to remember preset names.
