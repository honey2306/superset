const DEFAULT_FORCE_TIMEOUT_MS = 3_000;

export interface ShutdownServer {
	close(callback: () => void): unknown;
	closeAllConnections?: () => void;
}

export interface HostServiceShutdownOptions {
	server: ShutdownServer;
	disposeApp: () => Promise<void>;
	stopRelay?: () => void | Promise<void>;
	stopDevDaemon?: () => Promise<void>;
	exit?: (code: number) => void;
	forceTimeoutMs?: number;
}

export interface HostServiceShutdown {
	shutdown: (signal: NodeJS.Signals) => Promise<void>;
	removeSignalHandlers: () => void;
}

/**
 * Installs one ordered, idempotent shutdown path for the embedded host.
 * The listener closes first; relay ingress is then stopped while existing HTTP
 * work drains. App resources are disposed before the daemon is detached, and
 * remaining sockets are force-closed only after those cleanup phases (or at
 * the hard deadline). Every phase is isolated so one failure cannot skip the
 * cleanup that follows it.
 */
export function installHostServiceShutdown(
	options: HostServiceShutdownOptions,
): HostServiceShutdown {
	const exit = options.exit ?? ((code) => process.exit(code));
	let shutdownPromise: Promise<void> | null = null;
	let finalized = false;

	const finalize = (code: number): void => {
		if (finalized) return;
		finalized = true;
		exit(code);
	};

	const runCleanup = async (
		label: string,
		cleanup: (() => void | Promise<void>) | undefined,
	): Promise<void> => {
		if (!cleanup) return;
		try {
			await cleanup();
		} catch (error) {
			console.error(`[host-service] ${label} failed:`, error);
		}
	};

	const shutdown = (signal: NodeJS.Signals): Promise<void> => {
		if (shutdownPromise) return shutdownPromise;

		console.log(`[host-service] received ${signal}; shutting down`);
		const forceTimer = setTimeout(() => {
			console.error(
				"[host-service] graceful shutdown timed out; forcing finalization",
			);
			void runCleanup("closing remaining connections", () =>
				options.server.closeAllConnections?.(),
			).finally(() => finalize(0));
		}, options.forceTimeoutMs ?? DEFAULT_FORCE_TIMEOUT_MS);
		forceTimer.unref();

		shutdownPromise = (async () => {
			let resolveServerClosed: () => void = () => {};
			const serverClosed = new Promise<void>((resolve) => {
				resolveServerClosed = resolve;
			});
			try {
				options.server.close(resolveServerClosed);
			} catch (error) {
				console.error("[host-service] closing server failed:", error);
				resolveServerClosed();
			}

			// No new relay work may enter while the already accepted server work drains.
			await runCleanup("stopping relay", options.stopRelay);
			await serverClosed;
			await runCleanup("disposing app", options.disposeApp);
			await runCleanup("stopping development daemon", options.stopDevDaemon);
			await runCleanup("closing remaining connections", () =>
				options.server.closeAllConnections?.(),
			);

			clearTimeout(forceTimer);
			finalize(0);
		})();
		return shutdownPromise;
	};

	const onSigint = () => void shutdown("SIGINT");
	const onSigterm = () => void shutdown("SIGTERM");
	process.on("SIGINT", onSigint);
	process.on("SIGTERM", onSigterm);

	return {
		shutdown,
		removeSignalHandlers: () => {
			process.off("SIGINT", onSigint);
			process.off("SIGTERM", onSigterm);
		},
	};
}
