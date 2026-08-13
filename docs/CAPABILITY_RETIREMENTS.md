# Desktop Capability Retirements

This document records intentional removals made by the local-only Desktop
architecture. These are hard retirements: old clients and package consumers are
not supported by the converged release.

The removed hosted product stack does **not** include the Embedded Host's
`host.db`. Local Projects, Workspaces, Todos, Automations, phone sessions, and
runtime recovery records remain supported and authoritative there.

| Retired capability | Removed design | Current behavior or replacement |
| --- | --- | --- |
| Hosted Projects and Workspaces | Server-owned records, synchronized projections, renderer merge logic | `WorkspaceCatalog` in the one Embedded Host's `host.db` |
| Hosted Tasks and task boards | Server task authority and synchronized projections | Host-local Todos for personal work; GitHub Issues and pull requests for repository work |
| Remote Todo/Automation dispatch | Dispatch tokens and remote workers | Host-local persistence, scheduler, and run history; execution occurs only while the Desktop application is running |
| Linear integration | Provider configuration and task projection | GitHub Issues and pull requests remain supported |
| Remote Host discovery and tunneling | Host directory, tunnels, and remote workspace execution | No replacement; Desktop controls only its one Embedded Host |
| Hosted project secrets | Server-side project-secret storage | Local environment and repository/workspace configuration |
| Legacy Desktop domain authority | Electron-side Project, Workspace, task, terminal, and session projections | Electron stores settings/presentation only; Host APIs own domain state |
| Parallel workspace UI generations | Separate workspace/tab/pane state systems and migration bridges | `Panes` is the sole workspace layout and pane state model |
| Public compatibility surfaces from the hosted architecture | Retired routers, transports, and package exports | No compatibility layer; Desktop and its phone bundle use current Embedded Host contracts |
| Desktop account gate | Sign-in, organization selection, and onboarding paywall | All Desktop channels are local and no-login |

## Explicit non-replacements

- Phone is an experimental, internal-build-only local-LAN view of the Embedded
  Host. It is non-gating and is not a remote Host control plane.
- Detached PTY and ACP daemons preserve supported local runtime processes; they
  do not turn the Embedded Host into a background or remote service.
- Automations are application-bound. Closing Desktop stops schedule evaluation;
  no unattended system service continues dispatching them.

## Release requirements

Before release:

1. Confirm `host.db` and Desktop settings migrations remain isolated from
   removed hosted schemas.
2. Include hard retirements and the minimum supported version in release notes.
3. Validate stable, canary, and personal Desktop artifacts independently.
4. Confirm stable remains loopback-only and does not expose the experimental
   phone surface.

See [Current Desktop Architecture](CURRENT_ARCHITECTURE.md) for the authority
and lifecycle model. Dated records in `plans/done/` are preserved as historical
migration evidence and are not current compatibility documentation.
