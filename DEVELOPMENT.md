# Developing Superset

This guide is for contributors building the local-first Superset Desktop app from source. If you only want to use it, [download the latest macOS release](https://github.com/superset-sh/superset/releases/latest).

## Prerequisites

- macOS (primary supported platform)
- [Bun](https://bun.sh/) matching `.bun-version`
- Git 2.20+
- Optional [`gh`](https://cli.github.com/) for GitHub Issues, pull requests, checks, and releases

Superset does not require an account, Docker, Postgres, Redis, Neon, Stripe, or other cloud credentials. Repository clone/fetch/pull/push uses your normal Git and SSH configuration. `gh` is invoked on demand and does not run as a resident service.

## Run from a workspace

```bash
git clone https://github.com/superset-sh/superset.git
cd superset
./.superset/setup.local.sh
bun run dev
```

Run setup once in each new worktree. It:

1. installs Bun dependencies;
2. allocates worktree-specific Desktop and notification ports;
3. writes a local `.env` and `.superset/ports.json`;
4. configures subsequent Superset-created worktrees to use the same local setup.

`bun run dev` starts Desktop and its embedded Host Service. Workspace, Git, filesystem, terminal, ACP/chat, todo, and automation state is stored locally in `host.db`. Phone access, when enabled, connects directly to the local Host.

## Model and GitHub authentication

Model providers use local API keys, provider OAuth, or the selected CLI agent's own authentication. Git remotes use Git/SSH. GitHub platform features use local credentials and optional `gh`; they degrade independently when `gh` is unavailable or signed out.

## Commands

```bash
bun run dev          # Start Desktop
bun run test         # Turbo package tests
bun run lint:fix     # Format and fix lint issues
bun run lint         # Verify lint (warnings fail CI)
bun run typecheck    # Type-check packages
bun run build        # Build Desktop
```

`bun run start` is a compatibility wrapper around `bun run dev`. `bun run start:stop` and `.superset/teardown.local.sh` are safe no-ops because there is no managed background infrastructure.

See [`AGENTS.md`](./AGENTS.md) for repository conventions.
