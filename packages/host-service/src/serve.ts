import type { IncomingMessage } from "node:http";
import { dirname, join } from "node:path";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { mailboxId } from "@superset/session-protocol";
import { getHostId } from "@superset/shared/host-info";
import { createApp } from "./app";
import {
	AutoMateRelay,
	createDefaultAutoMateRelayTaskClient,
} from "./automate-relay";
import { getSupervisor, startDaemonBootstrap } from "./daemon";
import { env } from "./env";
import { installHostServiceShutdown } from "./graceful-shutdown";
import { LocalGitCredentialProvider } from "./providers/git";
import { PskHostAuthProvider } from "./providers/host-auth";
import { LocalModelProvider } from "./providers/model-providers";
import { installProcessSafetyNet } from "./safety";
import { startTerminalBaseEnvResolution } from "./terminal/env";
import { startTerminalReaper } from "./terminal/reaper";

function resolveDefaultWebAppDir(): string | undefined {
	try {
		// packages/host-service/dist/... at runtime; walk up to package root.
		const here = dirname(fileURLToPath(import.meta.url));
		return join(here, "..", "public", "web");
	} catch {
		return undefined;
	}
}

async function main(): Promise<void> {
	console.log(
		`[host-service] starting (org=${env.ORGANIZATION_ID}, port=${env.PORT}, NODE_ENV=${process.env.NODE_ENV ?? "unset"})`,
	);

	// Resolve the shell-env snapshot in the background — it must not block the
	// server from listening (the login-shell probe can burn the full 8s
	// budget). PTY creation awaits waitForTerminalBaseEnv() before it reads the
	// snapshot; every other request path is unaffected.
	startTerminalBaseEnvResolution();

	// Fire-and-track: kick off pty-daemon spawn-or-adopt without blocking
	// host-service startup. Terminal request handlers `await
	// waitForDaemonReady(orgId)` before using the supervisor's socket path,
	// so an in-flight bootstrap doesn't race with the first terminal launch.
	// Non-terminal requests (workspaces, git, chat) are unaffected if the
	// daemon takes time to come up or fails entirely.
	startDaemonBootstrap(env.ORGANIZATION_ID);

	const relayMailboxId = env.AUTOMATE_RELAY_URL
		? mailboxId(
				env.ORGANIZATION_ID,
				getHostId(),
				env.AUTOMATE_RELAY_MAILBOX_NAMESPACE,
			)
		: undefined;
	const { app, injectWebSocket, db, dispose } = createApp({
		config: {
			organizationId: env.ORGANIZATION_ID,
			dbPath: env.HOST_DB_PATH,
			migrationsFolder: env.HOST_MIGRATIONS_FOLDER,
			allowedOrigins: env.CORS_ORIGINS ?? [],
			webAppDir: env.SUPERSET_WEB_APP_DIR ?? resolveDefaultWebAppDir(),
			relayMailboxId,
		},
		providers: {
			hostAuth: new PskHostAuthProvider(env.HOST_SERVICE_SECRET),
			credentials: new LocalGitCredentialProvider(),
			modelResolver: new LocalModelProvider(),
		},
	});

	// Dev mode tears down the detached daemon for clean iteration. Production
	// deliberately leaves it alive so PTYs survive host-service restarts.
	const isDev = process.env.NODE_ENV === "development";

	const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
		// Install only after the server is listening so startup throws still
		// reach `main().catch(...)` and exit with a non-zero code.
		installProcessSafetyNet();
		console.log(`[host-service] listening on http://localhost:${info.port}`);

		startTerminalReaper(db);
	});
	const relay =
		env.AUTOMATE_RELAY_URL && relayMailboxId
			? new AutoMateRelay(relayMailboxId, {
					client: createDefaultAutoMateRelayTaskClient(env.AUTOMATE_RELAY_URL),
					fetch,
					baseUrl: `http://127.0.0.1:${env.PORT}`,
				})
			: undefined;
	relay?.start();
	installHostServiceShutdown({
		server,
		disposeApp: dispose,
		stopRelay: relay ? () => relay.stop() : undefined,
		stopDevDaemon: isDev
			? () => getSupervisor().stop(env.ORGANIZATION_ID)
			: undefined,
	});
	// Node detaches its own socket error handler before emitting `upgrade`, while
	// @hono/node-ws awaits app.request() before it adopts the socket. Keep a
	// listener through that gap so a peer ECONNRESET cannot terminate the process.
	server.on("upgrade", (request: IncomingMessage, socket: Duplex) => {
		// ACP query strings can contain a phone-session bearer. Log only the path.
		const requestPath = request.url?.split("?")[0] ?? "<unknown>";
		socket.on("error", (error: NodeJS.ErrnoException) => {
			console.warn(
				`[host-service] upgrade socket error (${error.code ?? error.message}) on ${requestPath} from ${request.socket.remoteAddress ?? "<unknown>"}`,
			);
		});
	});
	injectWebSocket(server);
}

void main().catch((error) => {
	console.error("[host-service] Failed to start:", error);
	process.exit(1);
});
