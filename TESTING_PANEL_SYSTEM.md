# Testing the New Panel System

## Quick Test Script

Run through these steps to verify the panel system works correctly:

### 1. Basic Toggle Tests

**Test Terminal:**
1. Launch ClifPad
2. ✅ Verify Terminal is visible on the left by default
3. Click "Terminal" button in StatusBar (bottom-left)
4. ✅ Verify Terminal disappears
5. Click "Terminal" button again
6. ✅ Verify Terminal reappears

**Test Files:**
1. ✅ Verify Files panel is visible on the right by default
2. Click "Hide Git/Files" button in TopBar (top-right)
3. ✅ Verify Files panel disappears
4. Click "Open Git/Files" button in TopBar
5. ✅ Verify Files panel reappears

**Test Agent:**
1. ✅ Verify Agent panel is NOT visible by default
2. Click "Open Agent" button in TopBar
3. ✅ Verify Agent panel appears on the right (Files panel should disappear)
4. Click "Agent" button in StatusBar (bottom-right)
5. ✅ Verify Agent panel disappears

**Test Editor:**
1. ✅ Verify Editor is visible in the center by default
2. Open a file
3. Click "Editor" button in StatusBar
4. ✅ Verify Editor disappears
5. Click "Editor" button again
6. ✅ Verify Editor reappears with the same file still open

### 2. Combination Tests

**Test: Agent + Files conflict resolution**
1. Make sure Files panel is visible
2. Click "Open Agent" button
3. ✅ Verify Agent appears and Files disappears (since they share the right space)
4. Click "Hide Agent" button
5. Click "Open Git/Files" button
6. ✅ Verify Files reappears

**Test: All panels visible**
1. Show Terminal (left)
2. Show Editor (center)
3. Show Files (right)
4. ✅ Verify all three are visible simultaneously
5. Try showing Agent
6. ✅ Verify Agent replaces Files in the right panel

**Test: Hide everything except one**
1. Hide Terminal
2. Hide Files/Agent
3. Hide Editor
4. ✅ Verify the last remaining panel stays visible
5. ✅ Verify no glitchy "pinning" to unexpected sides

### 3. Resize Tests

**Test Terminal resize:**
1. Show Terminal
2. Hover over the right edge of Terminal panel
3. ✅ Cursor changes to resize cursor
4. Drag left/right
5. ✅ Terminal width changes smoothly (20-80%)
6. Toggle Terminal off and on
7. ✅ Width is preserved

**Test Files/Agent resize:**
1. Show Files panel
2. Hover over the left edge
3. Drag to resize (180-500px)
4. Toggle Files off and on
5. ✅ Width is preserved
6. Switch to Agent
7. ✅ Agent uses different width setting

### 4. Edge Cases

**Test: Closing all panels**
1. Try to close all four panels
2. ✅ At least the editor should remain or you should still be able to interact with the app

**Test: Rapid toggling**
1. Rapidly click Agent button multiple times
2. ✅ No flickering or stuck states
3. Final state matches button state

**Test: App restart**
1. Show Terminal, Editor, Agent
2. Close app
3. Reopen app
4. ✅ Default layout loads (Terminal, Editor, Files)
5. ✅ Panel widths are preserved from last session

### 5. UI Consistency Tests

**Test: Button states**
1. When Terminal is visible:
   - ✅ StatusBar Terminal button shows active state (highlighted)
2. When Files is visible:
   - ✅ TopBar button shows "Hide Git/Files"
3. When Agent is visible:
   - ✅ TopBar button shows "Hide Agent"
   - ✅ StatusBar Agent button shows active state
4. When Editor is visible:
   - ✅ StatusBar Editor button shows active state

**Test: Tooltips**
1. Hover over each toggle button
2. ✅ Tooltip shows current state and action ("Hide X" or "Open X")

### 6. Regression Tests

**Test: Old functionality still works**
1. ✅ Git operations work with Files panel
2. ✅ Terminal tabs work correctly
3. ✅ Agent tool execution works
4. ✅ Editor Monaco features work (autocomplete, etc.)
5. ✅ File tree navigation works

### 7. Performance Tests

**Test: No memory leaks**
1. Toggle panels on/off 50+ times
2. ✅ Memory usage stays stable (check Activity Monitor/Task Manager)
3. ✅ No console errors

**Test: Smooth transitions**
1. Toggle panels rapidly
2. ✅ No janky animations
3. ✅ Resize handles respond immediately

## Expected Behavior Summary

| Action | Expected Result |
|--------|----------------|
| Click TopBar "Open Agent" | Agent panel appears on right, Files hides |
| Click TopBar "Hide Agent" | Agent panel disappears |
| Click TopBar "Open Git/Files" | Files panel appears on right, Agent hides |
| Click TopBar "Hide Git/Files" | Files panel disappears |
| Click StatusBar "Terminal" | Terminal toggles on/off on left |
| Click StatusBar "Agent" | Agent toggles on/off on right |
| Click StatusBar "Editor" | Editor toggles on/off in center |
| Close all but Agent | Agent doesn't "pin" to wrong position |
| App restart | Returns to default: Terminal + Editor + Files |

## Bug Reporting

If you find issues, report:
1. **Steps to reproduce** - Exact clicks/actions
2. **Expected** - What should happen
3. **Actual** - What actually happened
4. **State before** - Which panels were visible
5. **Console errors** - Check browser DevTools

## Success Criteria

✅ All toggle buttons work consistently  
✅ No panels "stick" in wrong positions  
✅ Agent and Files properly alternate in right space  
✅ Panel widths persist correctly  
✅ No console errors or warnings  
✅ UI feels responsive and predictable  
✅ Default state loads correctly on restart  
