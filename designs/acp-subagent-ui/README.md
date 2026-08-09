# ACP Subagent Timeline

Interactive design for rendering subagent activity as a nested, collapsible timeline card inside the existing ACP session pane.

## Design decisions

- Running, permission, and failed states default to expanded; completed defaults to collapsed.
- Once the user manually toggles the card, incoming activity does not steal their chosen state.
- Collapsed cards summarize tool count, completion, active work, and unread activity.
- Child tools and nested subagents remain recursively navigable.
- Subagent permissions use the same global permission card above the composer as top-level tools; the subagent card only exposes source context and an awaiting-approval state.

## Visual references

- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/AcpSessionPane/acp-pane.css`
- `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/AcpSessionPane/components/AcpTimeline/`
- `packages/session-protocol/src/fold/fold.ts`
- `designs/acp-terminal-agent/`
