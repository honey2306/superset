# Host Service Architecture

Superset Desktop embeds one Host service for the current local machine. The
Host is the sole runtime and persistence authority for local product domains;
Electron owns application lifecycle and native presentation, while the renderer
owns presentation and rebuildable projections.

See [`../../../docs/CURRENT_ARCHITECTURE.md`](../../../docs/CURRENT_ARCHITECTURE.md)
for the repository-wide product boundary.

## Layering

```text
Electron main
  - starts and stops the embedded Host with the app
  - owns windows, native menus, updates, and OS integration
  - supplies local credentials and configuration
        |
        v
Embedded Host (`packages/host-service`)
  - WorkspaceCatalog: canonical Project and Workspace identity (`host.db`)
  - workspace provisioning: Git + filesystem materialization
  - Git and filesystem APIs
  - terminal and ACP session execution
  - local Todo and Automation persistence/scheduling
  - GitHub Issue, pull-request, review, and checks integration
        |
        +-- renderer: UI and rebuildable catalog/runtime projections
        `-- paired phone: AutoMate relay to loopback Host
```

## Authority rules

- `host.db` and Host APIs are authoritative for Projects, Workspaces, local
  Todos, Automations, Automation runs, phone sessions, and Host runtime records.
- `WorkspaceCatalog` is the only Project/Workspace identity seam. A renderer
  cache, route, pane layout, or optimistic row is never a second authority.
- Git, filesystem, diff, terminal, and ACP operations execute through the Host.
- Legacy Electron `local.db`, Electric collections, and cloud Tasks are not
  Desktop domain sources or fallback merge inputs.
- GitHub is an external integration, not the owner of local Workspace state.

## Phone boundary

A phone reaches this embedded Host only through the configured AutoMate relay.
The Host stays bound to loopback; Desktop creates a short-lived pairing code
that opens the AutoMate WebApp, and redemption yields a revocable, host-scoped
session. There is no direct LAN/Tailscale listener, remote-host discovery, or
remote workspace-host control plane.

## Cloud boundary

Account/authentication, GitHub, updates, downloads, and marketing may use the
remaining API/web applications. Those applications do not own or synchronize
Desktop Workspace, Todo, Automation, terminal, filesystem, Git, or ACP state.

For process lifetime and detached runtime recovery, see
[HOST_SERVICE_LIFECYCLE.md](./HOST_SERVICE_LIFECYCLE.md).
