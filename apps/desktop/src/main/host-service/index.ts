/**
 * Workspace Service — Desktop Entry Point
 *
 * Starts the host-service HTTP server on a port assigned by the coordinator.
 * The coordinator polls health.check to know when it's ready.
 */

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { serve } from "@hono/node-server";
import {
	AutoMateRelay,
	createApp,
	createDefaultAutoMateRelayTaskClient,
	getSupervisor,
	installProcessSafetyNet,
	LocalGitCredentialProvider,
	LocalModelProvider,
	PskHostAuthProvider,
	startDaemonBootstrap,
	startTerminalReaper,
} from "@superset/host-service";
import {
	initTerminalBaseEnv,
	resolveTerminalBaseEnv,
} from "@superset/host-service/terminal-env";
import { mailboxId } from "@superset/session-protocol";
import { getHostId } from "@superset/shared/host-info";
import { writeManifest } from "main/lib/host-service-manifest";
import { shutdownHostDaemon } from "./daemon-shutdown";
import { env } from "./env";

const SHUTDOWN_GRACE_MS = 3_000;
const WATCHDOG_INTERVAL_MS = 2_000;

type Server = ReturnType<typeof serve>;
type Relay = AutoMateRelay;

async function main(): Promise<void> {
	// Install the parent watchdog before any awaits so a crash during
	// startup can still reap this child. `serverRef` is filled in once
	// serve() returns; shutdown handles both pre- and post-bind states.
	const serverRef: { current: Server | null } = { current: null };
	const relayRef: { current: Relay | null } = { current: null };
	let shuttingDown = false;
	const shutdown = (reason: string) => {
		if (shuttingDown) return;
		shuttingDown = true;
		relayRef.current?.stop();
		console.log(`[host-service] shutdown (${reason}), draining connections`);
		const finalizeDaemon = () =>
			shutdownHostDaemon({
				supervisor: getSupervisor(),
				organizationId: env.ORGANIZATION_ID,
				isDevelopment: process.env.NODE_ENV === "development",
			});
		const server = serverRef.current;
		if (!server) {
			void finalizeDaemon().finally(() => process.exit(0));
			return;
		}
		server.close(() => {
			void finalizeDaemon().finally(() => process.exit(0));
		});
		// SSE/WS streams (chat, watchers) ignore server.close() — give in-flight
		// HTTP a brief window, then forcibly tear sockets down.
		const forceExit = setTimeout(() => {
			const httpServer = server as unknown as {
				closeAllConnections?: () => void;
			};
			httpServer.closeAllConnections?.();
			void finalizeDaemon().finally(() => process.exit(0));
		}, SHUTDOWN_GRACE_MS);
		forceExit.unref();
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));

	// Self-exit if our Electron parent dies without sending SIGTERM
	// (orphan reparenting to init/launchd). CLI-spawned host-services
	// don't set HOST_PARENT_PID and skip this.
	const parentPid = Number(process.env.HOST_PARENT_PID);
	if (Number.isInteger(parentPid) && parentPid > 1) {
		const interval = setInterval(() => {
			if (!isParentAlive(parentPid)) {
				clearInterval(interval);
				shutdown("parent-exit");
			}
		}, WATCHDOG_INTERVAL_MS);
		interval.unref();
	}

	const terminalBaseEnv = await resolveTerminalBaseEnv();
	initTerminalBaseEnv(terminalBaseEnv);
	startDaemonBootstrap(env.ORGANIZATION_ID);

	const relayMailboxId = env.AUTOMATE_RELAY_URL
		? mailboxId(
				env.ORGANIZATION_ID,
				getHostId(),
				env.AUTOMATE_RELAY_MAILBOX_NAMESPACE,
			)
		: undefined;
	const { app, injectWebSocket, db } = createApp({
		config: {
			organizationId: env.ORGANIZATION_ID,
			dbPath: env.HOST_DB_PATH,
			migrationsFolder: env.HOST_MIGRATIONS_FOLDER,
			webAppDir: env.SUPERSET_WEB_APP_DIR,
			allowedOrigins: [
				`http://localhost:${env.DESKTOP_VITE_PORT}`,
				`http://127.0.0.1:${env.DESKTOP_VITE_PORT}`,
			],
			relayMailboxId,
		},
		providers: {
			hostAuth: new PskHostAuthProvider(env.HOST_SERVICE_SECRET),
			credentials: new LocalGitCredentialProvider(),
			modelResolver: new LocalModelProvider(),
		},
	});

	const startedAt = Date.now();
	const server = serve(
		{
			fetch: app.fetch,
			port: env.HOST_SERVICE_PORT,
			hostname: env.HOST_SERVICE_HOSTNAME,
		},
		(info: { port: number }) => {
			// Install only after the server is listening so startup throws still
			// reach `main().catch(...)` and exit with a non-zero code.
			installProcessSafetyNet();

			// Orphan reaping + port detection for terminals no renderer has attached.
			startTerminalReaper(db);

			if (env.ORGANIZATION_ID) {
				try {
					writeManifest({
						pid: process.pid,
						endpoint: `http://127.0.0.1:${info.port}`,
						authToken: env.HOST_SERVICE_SECRET,
						startedAt,
						organizationId: env.ORGANIZATION_ID,
					});
				} catch (error) {
					console.error("[host-service] Failed to write manifest:", error);
				}
			}
		},
	);
	serverRef.current = server;
	const relay =
		env.AUTOMATE_RELAY_URL && relayMailboxId
			? new AutoMateRelay(relayMailboxId, {
					client: createDefaultAutoMateRelayTaskClient(env.AUTOMATE_RELAY_URL),
					fetch,
					baseUrl: `http://127.0.0.1:${env.HOST_SERVICE_PORT}`,
				})
			: undefined;
	relayRef.current = relay ?? null;
	relay?.start();
	// Keep an error listener during the gap between Node emitting `upgrade` and
	// @hono/node-ws adopting the socket. A peer reset in that window must not
	// take down the bundled host-service process.
	server.on("upgrade", (request: IncomingMessage, socket: Duplex) => {
		const requestPath = request.url?.split("?")[0] ?? "<unknown>";
		socket.on("error", (error: NodeJS.ErrnoException) => {
			console.warn(
				`[host-service] upgrade socket error (${error.code ?? error.message}) on ${requestPath} from ${request.socket.remoteAddress ?? "<unknown>"}`,
			);
		});
	});
	injectWebSocket(server);
}

function isParentAlive(parentPid: number): boolean {
	try {
		process.kill(parentPid, 0);
		return process.ppid === parentPid;
	} catch {
		return false;
	}
}

void main().catch((error) => {
	console.error("[host-service] Failed to start:", error);
	process.exit(1);
});
