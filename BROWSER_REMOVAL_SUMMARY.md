# Internal Browser Feature Removal Summary

## Overview
Removed the internal browser (webview) and DevTools features from the desktop app to align with the single-user, local development focus.

## Files Modified

### Core Components Removed
- `V1PanesBrowserContent/` - Browser pane component
- `V1PanesDevToolsContent/` - DevTools pane component
- `BrowserNavigation.tsx` - Browser navigation toolbar
- `BrowserPane.tsx` - Legacy browser pane

### Type Definitions Updated
- `apps/desktop/src/shared/tabs-types.ts`
  - Removed `BrowserPaneState` and `DevToolsPaneState` interfaces
  - Updated `PaneType` to exclude "webview" and "devtools"
  - Removed `BrowserHistoryEntry` type

### Store & Registry Updates
- `apps/desktop/src/renderer/stores/tabs/store.ts`
  - Removed `addBrowserTab()`, `openInBrowserPane()`, `createBrowserPane()`
  - Simplified split pane operations (always create terminal)
  - Removed browser-related actions and state management

- `V1PanesWorkspace/useV1PanesWorkspace.tsx`
  - Removed webview and devtools pane definitions from registry
  - Removed `createBrowserState()` helper
  - Simplified registry to only include: terminal, file-viewer, comment

- `V1PanesWorkspace/buildV1PanesNonTerminalRegistry.ts`
  - Removed `devtoolsPaneTitle()` and `webviewPaneTitle()`
  - Kept only `commentPaneTitle()` for the remaining non-terminal pane

### UI Components Updated
- `EmptyTabView.tsx` - Removed "Open Browser" action
- `GroupStrip/GroupStrip.tsx` - Removed browser tab addition
- `Terminal/HostServiceTerminalPane.tsx` - URLs now always open externally
- `Terminal/Terminal.tsx` - Removed internal browser URL handler
- `TabView/index.tsx` - Removed devtools field from pane mapping

### Deep Link & Preset Handlers
- `useV1PanesDeepLinkConsumer.ts` - Stubbed out `openUrlInWorkspace()`
- `useV1PanesPresetOpeners.ts` - Stubbed out `addBrowserTab()`

### Schema & Validation
- `apps/desktop/src/lib/trpc/routers/ui-state/index.ts`
  - Updated `paneSchema` to remove "webview" and "devtools" types
  - Removed `browser` and `devtools` field schemas

### Tests Updated
- `buildV1PanesNonTerminalRegistry.test.ts` - Removed browser/devtools tests
- `v1-panes-workspace.test.ts` - Removed webview/devtools test cases

## Behavior Changes

### URL Handling
- **Before**: URLs clicked in terminal could open in internal browser panes
- **After**: All URLs open in the system's default external browser

### Split Pane Operations
- **Before**: Could split to create terminal or browser panes
- **After**: Split operations always create terminal panes

### Tab Actions
- **Before**: "New Browser Tab" action available
- **After**: Action removed from UI

## Migration Notes

### For Users
- Existing browser/devtools panes in saved workspace state will be ignored
- No data loss - terminal and file viewer panes remain functional
- URLs now open externally (system browser)

### For Developers
- `PaneType` is now limited to: `"terminal" | "file-viewer" | "comment"`
- Browser-related store actions are removed
- Legacy persisted state with browser panes is safely ignored (schema allows unknown fields)

## Testing
- All TypeScript compilation passes
- Biome lint passes (2 unrelated warnings remain)
- Test suites updated to reflect changes

## Future Considerations
If internal browser support is needed again:
1. Check git history for this removal
2. Consider using system webview API instead of Electron `<webview>`
3. Evaluate if external browser integration meets needs first
