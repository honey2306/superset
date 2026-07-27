import { useCallback, useMemo } from "react";

/**
 * A `TerminalLauncher` for the v1-panes mount that does NOT pre-create the
 * host-service session.
 *
 * v2's launcher awaits `terminal.createSession` before writing the pane so
 * the pane's WebSocket connect doesn't race ahead of the session existing
 * on host-service. The v1 mount reuses the M0–M5 neutral
 * `HostServiceTerminalPane`, whose `useHostServiceTerminal` adapter
 * `createOrAttach` is idempotent: it adopts an existing in-memory session,
 * adopts a daemon PTY that survived a host-service restart, or spawns a
 * fresh one. So the pane only needs a `terminalId` up front; the session
 * is created when the pane mounts. This avoids re-implementing the
 * host-service connection path the M1 verification already proved works.
 *
 * The `create()` shape matches v2's `TerminalLauncher` so the v2 default
 * pane/context-menu action hooks (which split a new terminal pane) can
 * consume this launcher unchanged.
 */
export interface V1TerminalLauncher {
	create: () => Promise<string>;
}

export function useV1TerminalLauncher(): V1TerminalLauncher {
	const create = useCallback(async () => crypto.randomUUID(), []);
	return useMemo<V1TerminalLauncher>(() => ({ create }), [create]);
}
