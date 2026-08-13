# Host Service Lifecycle

## Architecture

Superset Desktop starts one Embedded Host for the current local machine. The
processes deliberately have two lifetime classes:

```text
Electron main
  - owns windows, native integration, and application lifecycle
  - starts/stops one Embedded Host
        |
        v
Embedded Host (attached child process)
  - owns host.db and Host API authority
  - evaluates local Todo and Automation schedules
  - connects to detached runtime daemons
        |
        +-- pty-daemon -> terminal PTYs
        `-- acp-daemon -> ACP adapters and active interactions
```

The Embedded Host is coupled to Electron: it starts with Desktop and stops when
Desktop exits. It is not an independently selected organization Host, a remote
workspace Host, or an OS background service.

The renderer has no process-lifecycle authority. It consumes Host state and
keeps presentation state in `Panes`, the sole workspace layout and pane model.
A route change, workspace switch, pane remount, or renderer restart may detach a
view, but it does not itself terminate a Host runtime.

## Detached runtime ownership

PTY and ACP lifetimes are independent from both renderer components and the
Embedded Host process:

- `pty-daemon` owns terminal child processes and supports reconnect through its
  local socket and manifest.
- `acp-daemon` owns ACP adapter stdio, journals, in-flight turns, pending
  permissions/questions, and active session state. A replacement Host adopts
  its local socket and resumes stream subscriptions.
- Canonical Project/Workspace identity and recoverable session bindings remain
  in `host.db`; detached daemons are runtime owners, not competing data
  authorities.

In production, normal Host shutdown disconnects from the detached daemons so
supported sessions can reconnect on the next launch. Development shutdown may
stop the PTY daemon intentionally so a changed bundle starts fresh. **Quit
Completely** and explicit runtime-close actions are destructive by design.

## Close and detach semantics

- Detaching or unmounting a terminal pane releases renderer resources only.
  Explicit terminal close terminates the PTY through the Host runtime.
- Detaching an ACP pane view releases its renderer subscription only. The ACP
  adapter remains daemon-owned and may continue an active interaction.
- The user-facing **Close agent session** action is not a detach. It invokes the
  Host's explicit ACP `close` operation, tears down the adapter, and deletes the
  durable recoverable session rows. If that operation fails, the pane remains
  visible so the user can retry.
- Closing a whole `Panes` tab invokes the same ACP close semantics for contained
  agent sessions.

## Automation lifetime

The local Automation scheduler is constructed inside the Embedded Host and
reads only `host.db`. It ticks while the Host process is alive and can execute
while offline, but it is application-bound: when Desktop is closed there is no
scheduler process to evaluate due work, and Desktop is not woken by the OS.
Overdue work is considered when the Host starts again according to the local
scheduler's recurrence rules.

## Phone lifetime and exposure

Phone access is experimental, internal-build-only, and non-gating. Internal
builds bind the same Embedded Host to the trusted local LAN and serve the phone
web bundle from it; stable builds remain loopback-only. Pairing yields a
revocable Host-scoped session with an allowlisted API surface.

Phone exposure neither starts a second Host nor changes Desktop readiness,
authority, sign-in, or release gates. Closing Desktop stops the Embedded Host
and therefore makes the phone surface unavailable even if detached PTY or ACP
runtime processes remain alive.

## Host shutdown and reaping

Electron `before-quit` calls the coordinator's stop path and SIGTERMs the
attached Host child. The child closes its HTTP server, drains briefly, releases
daemon supervision, and exits. If Electron crashes, the Host's parent-PID
watchdog observes the missing parent and performs the same shutdown.

| Exit path | Embedded Host behavior |
| --- | --- |
| Clean quit, tray quit, or update install | Electron stops the attached child; the child drains HTTP and releases daemon connections |
| Electron force-kill or crash | Parent-PID watchdog initiates Host shutdown |
| Development SIGTERM/SIGINT | Coordinator stops the Host before Electron exits; development daemon policy may intentionally start fresh |

The local Host manifest records PID, endpoint, credentials, and the internal
local identity used for storage paths. It supports health/recovery tooling; it
is not a directory of additional or remotely adoptable Hosts.

See [`../../../docs/CURRENT_ARCHITECTURE.md`](../../../docs/CURRENT_ARCHITECTURE.md)
for the repository-wide authority and product boundary.
