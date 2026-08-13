# Current Desktop Architecture

Superset Desktop is a local-only application. Stable, canary, personal, and
development builds open directly into the local product and do not require a
Superset account or organization sign-in. Build channels control artifact
identity, update feeds, and whether experimental surfaces are exposed; they do
not select a different data architecture.

This document describes the current product boundary. Dated plans under
`plans/done/` are historical implementation records, not active architecture.

## One Embedded Host

Each Desktop application instance starts exactly one Embedded Host for the
current machine. Electron owns application lifecycle and native integration;
the Embedded Host owns machine data and runtime operations:

- `WorkspaceCatalog` owns canonical Project and Workspace identity in `host.db`.
- Workspace provisioning owns Git and filesystem materialization and commits
  successful results to the catalog.
- Git, GitHub, filesystem, diff, terminal, ACP, Todo, and Automation operations
  execute through Host APIs.
- Todos, Automations, prompt versions, run history, phone sessions, and runtime
  recovery records are persisted in `host.db`.

There is no second workspace Host selected by account or organization, no
remote-Host discovery, and no cloud data authority to merge with the Embedded
Host.

## Host and renderer authority

The renderer owns presentation and rebuildable projections only. `Panes` is the
sole workspace layout and pane state model: routes, sidebar state, optimistic
rows, and renderer caches may point at Host-owned identities, but they do not
mint or reconcile a second Project, Workspace, terminal, ACP session, Todo, or
Automation identity.

The legacy Electron `local.db` may retain Desktop settings and presentation
preferences. It is not an authority or fallback store for Host-owned domains.

## Runtime lifecycle

Electron starts and stops the Embedded Host with the application. PTYs and ACP
adapter processes are instead owned by separate detached daemons. Renderer
unmounts and transport reconnects therefore detach views without terminating
those runtimes; the next Host process can reconnect to the daemons and recover
canonical bindings from `host.db`.

ACP has an explicit permanent close operation. A temporary pane detach leaves
the session running, while the user-facing close action tears down the adapter
and removes the recoverable ACP session record. Terminal close follows its own
explicit PTY termination path.

The Automation scheduler lives in the Embedded Host process. Automations are
application-bound: schedules are evaluated only while Desktop and its Host are
running. The scheduler can run without an Internet connection, but it is not an
OS background service and does not wake a closed application.

## Phone access

Phone access is experimental, internal-build-only, and non-gating. Internal
builds may expose the Embedded Host on the trusted local LAN and serve the phone
web bundle from that same Host. Pairing creates a revocable, Host-scoped phone
session and grants only the allowlisted phone surface.

Stable Desktop remains loopback-only. Phone availability never changes Desktop
startup, sign-in, Project/Workspace authority, or release eligibility. It is not
a remote workspace-host control plane.

## Historical decision records

The following archived plans retain migration rationale that is not repeated
here:

- Terminal convergence: [`20260724-v1-v2-terminal-fusion.md`](../plans/done/20260724-v1-v2-terminal-fusion.md) and [`20260726-v1-shell-v2-base-fusion.md`](../plans/done/20260726-v1-shell-v2-base-fusion.md)
- Local Project and Workspace authority: [`20260716-local-first-projects.md`](../plans/done/20260716-local-first-projects.md), [`local-first-projects-reference.md`](../plans/done/local-first-projects-reference.md), [`20260703-offline-first-workspace-table.md`](../plans/done/20260703-offline-first-workspace-table.md), and [`offline-first-workspace-table-reference.md`](../plans/done/offline-first-workspace-table-reference.md)
- Workspace filesystem boundary: [`workspace-filesystem-migration.md`](../plans/done/workspace-filesystem-migration.md) and [`workspace-filesystem-transport-plan.md`](../plans/done/workspace-filesystem-transport-plan.md)
- Host transport convergence: [`acp-host-client-unification.md`](../plans/done/acp-host-client-unification.md)
- PTY lifecycle: [`pty-lifecycle-cleanup.md`](../plans/done/pty-lifecycle-cleanup.md)
- Earlier generation migration and removal: [`20260716-v1-to-v2-auto-migration.md`](../plans/done/20260716-v1-to-v2-auto-migration.md), [`v1-to-v2-fast-migration.md`](../plans/done/v1-to-v2-fast-migration.md), and [`v1-v2-delete-patterns-audit.md`](../plans/done/v1-v2-delete-patterns-audit.md)

## Current documentation

Use this document, [Desktop Capability Retirements](CAPABILITY_RETIREMENTS.md),
and [Host Service Lifecycle](../apps/desktop/docs/HOST_SERVICE_LIFECYCLE.md)
for the current system. Historical plans may name removed migrations,
transports, services, or UI generations; those names do not describe supported
runtime paths.
