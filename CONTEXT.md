# Superset domain context

This file names the domain concepts that should remain stable while their
implementations evolve. Architecture and code should use these terms
consistently.

## Workspace Catalog

The host-owned registry of Projects and Workspaces. `host.db` is its only
authority. Renderer caches, pane state, routes, and cloud rows are projections;
they never create or repair Workspace identity.

There is one Catalog per host. A Workspace belongs to exactly one host; a
Project identity may intentionally be preserved when that Project is set up on
another host. This is not one global database and not an editor “workspace.”

## Workspace Provisioning Operation

A durable host-side operation that turns a user launch intent into a canonical
Workspace. It owns idempotency, Git/filesystem materialization, Catalog commit,
recovery, and ownership-aware compensation. It may ask Terminal Runtime to
ensure initial sessions, but it does not own their later lifecycle.

## Workspace Launch Coordinator

A renderer presentation Module. It submits a Workspace Provisioning Operation,
projects progress into the UI, navigates to the canonical Workspace returned by
the host, and writes view state. It is not a second workflow engine or source of
truth.

## Workspace Projection

A rebuildable view of Workspace Catalog state used by the renderer, CLI, or
other clients. A projection may be cached for offline display, but mutations and
identity always resolve through the owning host.

## Terminal Runtime

The single authority for terminal sessions and their lifecycle. Workspace
Provisioning can request an initial session through this Interface; panes and
tabs only attach to session IDs returned by the runtime.
