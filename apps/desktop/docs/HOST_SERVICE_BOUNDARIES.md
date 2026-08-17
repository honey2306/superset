# Host Service Boundaries

This is the concrete ownership boundary for the embedded Desktop Host. See
[HOST_SERVICE_ARCHITECTURE.md](./HOST_SERVICE_ARCHITECTURE.md) for the overview
and [`../../../docs/CURRENT_ARCHITECTURE.md`](../../../docs/CURRENT_ARCHITECTURE.md)
for the product boundary.

## Host (`packages/host-service`)

The Host owns:

- `WorkspaceCatalog` identity and revisioned Project/Workspace projections;
- durable workspace provisioning and recovery;
- Git, GitHub, filesystem, diff, and workspace cleanup operations;
- terminal and ACP session runtime APIs;
- local Todo and Automation records, schedules, prompt versions, and run history;
- phone pairing codes, host-scoped sessions, validation, and revocation.

The Host persists machine-owned records in `host.db`. Its tRPC and WebSocket
interfaces are the only operational seams for these domains.

## Electron main (`apps/desktop`)

Electron main owns:

- starting and stopping the embedded Host with the app;
- native windows, menus, updates, notifications, and OS integration;
- local environment and credential discovery;
- exposing the current Host connection to the renderer.

Electron does not implement a parallel Project/Workspace, Git, filesystem,
terminal, Todo, or Automation authority. The legacy Electron `local.db` is not
a fallback domain store.

## Renderer

The renderer owns UI state and rebuildable projections. It consumes
`WorkspaceCatalog` and Host runtime APIs. Local pane layout, sidebar placement,
filters, and transient optimistic state may be persisted for presentation, but
must not mint or reconcile canonical domain identity.

## GitHub and cloud applications

GitHub remains an external provider for repository metadata, Issues, pull
requests, reviews, checks, and requested publish operations. Remaining API/web
applications may support authentication, GitHub integration, updates,
downloads, or marketing. They are not Desktop data authorities and do not
provide Electric/cloud-Task fallback for Host-owned domains.

## Phone

Phone access reaches the embedded Host through the configured AutoMate relay.
The embedded Host remains loopback-only; pairing creates a revocable Host
session. There is no direct LAN/Tailscale transport, remote-host registry, or
remote workspace execution path.
