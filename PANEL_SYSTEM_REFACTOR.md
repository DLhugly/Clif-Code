# Panel System Refactor

## Problem
The tab/panel system for Terminal, Agent, Files/Git, and Editor was glitchy and inconsistent because there were **two separate systems** managing panel visibility:

1. **Layout Preset System** - Used `leftPanel`/`rightPanel` signals with preset configurations
2. **Direct Toggle Functions** - Used individual visibility signals (`terminalVisible`, `sidebarVisible`, `agentVisible`, `editorVisible`)

These two systems weren't synchronized, causing issues like:
- Closing panels could leave them "pinned" in unexpected positions
- Agent panel wasn't integrated with the preset system
- Toggling panels from different locations (TopBar vs StatusBar) could produce inconsistent results

## Solution
**Unified Panel Management System** with a single source of truth:

### New Architecture
- **Single state**: `visiblePanels` - a `Set<Panel>` containing: `"terminal"`, `"agent"`, `"files"`, `"editor"`
- **Derived signals**: All visibility checks computed from the single state
- **Simple API**: `togglePanel()`, `showPanel()`, `hidePanel()`, `setPanelVisibility()`

### Key Changes

#### 1. `src/stores/uiStore.ts`
- **Removed**: `PanelSlot`, `LayoutPreset`, `LAYOUT_PRESETS`, `leftPanel`, `rightPanel`, layout preset functions
- **Added**: `Panel` type, `visiblePanels` signal, unified panel management functions
- **Kept for compatibility**: All existing toggle/setter functions now route through the unified system

#### 2. `src/components/layout/TopBar.tsx`
- **Removed**: Layout dropdown with presets
- **Added**: Simple Agent toggle button (matches the existing Files toggle pattern)
- Agent and Files toggles now sit side-by-side in the top bar

#### 3. `src/stores/settingsStore.ts`
- **Removed**: `leftPanel` and `rightPanel` from Settings interface
- Panel visibility is now ephemeral (not persisted across sessions)

#### 4. `src/App.tsx`
- **Removed**: Layout restoration logic from settings

## Benefits
✅ **Single source of truth** - No more conflicting state  
✅ **Predictable behavior** - Toggling a panel always does the same thing  
✅ **Simpler UI** - Direct toggle buttons instead of complex preset system  
✅ **Better flexibility** - Users can show/hide any combination of panels  
✅ **Backward compatible** - All existing toggle functions still work  

## User-Facing Changes
- **Layout dropdown removed** from top bar
- **Agent toggle button added** to top bar (next to Files toggle)
- Users now have direct control over each panel independently
- Panel visibility resets to default (Terminal, Files, Editor) on app restart

## Migration Notes
- Existing saved layout preferences (`leftPanel`/`rightPanel` in settings) will be ignored
- No data loss - just reverts to showing Terminal, Files, and Editor by default
- Users can quickly toggle panels on/off using:
  - TopBar: Agent button, Files button
  - StatusBar: Terminal button, Agent button, Editor button

## Technical Details

### Before:
```typescript
// Two competing systems
const [leftPanel, setLeftPanel] = createSignal<PanelSlot>("terminal");
const [rightPanel, setRightPanel] = createSignal<PanelSlot>("sidebar");
const [terminalVisible, setTerminalVisible] = createSignal(true);
const [agentVisible, setAgentVisible] = createSignal(false);
// ... could get out of sync
```

### After:
```typescript
// Single source of truth
const [visiblePanels, setVisiblePanels] = createSignal<Set<Panel>>(
  new Set(["terminal", "files", "editor"])
);

// Derived signals (always consistent)
const terminalVisible = () => visiblePanels().has("terminal");
const agentVisible = () => visiblePanels().has("agent");
```

## Testing Checklist
- [ ] Toggle Terminal from StatusBar
- [ ] Toggle Agent from TopBar
- [ ] Toggle Agent from StatusBar  
- [ ] Toggle Files from TopBar
- [ ] Toggle Editor from StatusBar
- [ ] Close all panels except one - verify no "pinning" issues
- [ ] Open multiple panels simultaneously
- [ ] Restart app - verify default layout loads correctly
- [ ] Resize panels - verify they maintain proper widths
