import { getConnInfo } from "@hono/node-server/conninfo";
import { createNodeWebSocket } from "@hono/node-ws";
import { trpcServer } from "@hono/trpc-server";
import { Octokit } from "@octokit/rest";
import { ChatService } from "@superset/chat/server/desktop";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb, type HostDb } from "./db";
import { EventBus, GitWatcher, registerEventBusRoute } from "./events";
import {
	NotificationHookSecurity,
	setActiveNotificationHookSecurity,
} from "./notifications/notification-hook-security";
import {
	CompositeHostAuthProvider,
	type HostAuthProvider,
	PhoneSessionAuthProvider,
} from "./providers/host-auth";
import type { ModelProviderRuntimeResolver } from "./providers/model-providers";
import { registerStaticAppRoute } from "./routes/static-app";
import {
	AcpDaemonClient,
	type AcpSessionManager,
	registerAcpSessionStreamRoute,
} from "./runtime/acp-sessions";
import { ChatRuntimeManager } from "./runtime/chat";
import { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider } from "./runtime/git";
import { createGitFactory } from "./runtime/git";
import { LocalAutomationScheduler } from "./runtime/local-automations";
import { runMainWorkspaceSweep } from "./runtime/main-workspace-sweep";
import { PhoneAuthService } from "./runtime/phone";
import { PullRequestRuntimeManager } from "./runtime/pull-requests";
import { registerWorkspaceTerminalRoute } from "./terminal/terminal";
import { registerTransientTerminalRoute } from "./terminal/transient-terminal";
import {
	SqliteTerminalAgentBindingPersistence,
	TerminalAgentStore,
} from "./terminal-agents";
import { appRouter } from "./trpc/router";
import {
	execGh as defaultExecGh,
	type ExecGh,
} from "./trpc/router/workspace-creation/utils/exec-gh";
import type { HostServiceRuntime } from "./types";
import {
	runCatalogIdentityBackfill,
	WorkspaceCatalog,
} from "./workspace-catalog";
import {
	createProductionRunner,
	createProductionTerminalRuntime,
	runProvisioningResumeSweep,
	WorkspaceProvisioning,
} from "./workspace-provisioning";

export interface CreateAppOptions {
	config: {
		organizationId: string;
		dbPath: string;
		migrationsFolder: string;
		allowedOrigins: string[];
		/**
		 * Absolute path to a Vite `build.outDir` for `apps/web`. When set the
		 * bundle is served at `/app/*` on the same origin as the tRPC API,
		 * making CORS a non-issue for the phone frontend. Omit to disable the
		 * route entirely (default in tests and dev where the phone frontend
		 * is served by a separate Vite dev server).
		 */
		webAppDir?: string;
		relayMailboxId?: string;
	};
	providers: {
		hostAuth: HostAuthProvider;
		credentials: GitCredentialProvider;
		modelResolver: ModelProviderRuntimeResolver;
	};
	/**
	 * Test-harness override hooks. Production never sets these — `createApp`
	 * builds each subsystem itself when omitted. `db` is overridden so tests
	 * can swap in `bun:sqlite` (better-sqlite3 isn't loadable under Bun;
	 * prod uses it on bundled Node). `github`, `chatRuntime`, and
	 * `chatService` are overridden to keep tests off the network and out of
	 * mastra storage.
	 */
	db?: HostDb;
	github?: () => Promise<Octokit>;
	execGh?: ExecGh;
	chatRuntime?: ChatRuntimeManager;
	chatService?: ChatService;
	acpSessions?: AcpSessionManager;
}

export interface CreateAppResult {
	app: Hono;
	injectWebSocket: ReturnType<typeof createNodeWebSocket>["injectWebSocket"];
	db: HostDb;
	notificationHookCapability: (terminalId: string) => string;
	dispose: () => Promise<void>;
}

const RESERVED_TERMINAL_IDS = new Set([
	"sessions",
	"resource-sessions",
	"transient",
]);

/** Whether a request is a phone-eligible workspace-terminal WebSocket. */
export function isPhoneWorkspaceTerminalWebSocketRequest(input: {
	method: string;
	path: string;
	upgrade: string | undefined;
	workspaceId: string | undefined;
}): boolean {
	const terminalId = /^\/terminal\/([^/]+)$/.exec(input.path)?.[1];
	return (
		input.method === "GET" &&
		input.upgrade?.toLowerCase() === "websocket" &&
		input.workspaceId !== undefined &&
		input.workspaceId.length > 0 &&
		terminalId !== undefined &&
		!RESERVED_TERMINAL_IDS.has(terminalId)
	);
}

export function createApp(options: CreateAppOptions): CreateAppResult {
	const { config, providers } = options;

	const db = options.db ?? createDb(config.dbPath, config.migrationsFolder);
	const git = createGitFactory(providers.credentials);
	const github =
		options.github ??
		(async () => {
			const token = await providers.credentials.getToken("github.com");
			if (!token) {
				throw new Error(
					"No GitHub token available. Set GITHUB_TOKEN/GH_TOKEN or authenticate via git credential manager.",
				);
			}
			return new Octokit({ auth: token });
		});
	const execGh: ExecGh = options.execGh ?? defaultExecGh;

	const filesystem = new WorkspaceFilesystemManager({ db });
	const notificationHooks = new NotificationHookSecurity(config.dbPath);
	setActiveNotificationHookSecurity(notificationHooks);

	// Phone auth substrate. Constructed early so the composite auth provider
	// below can layer phone-session validation on top of the PSK the caller
	// supplied. The service is stateless w.r.t. the rest of the runtime and
	// only reaches into the SQLite DB.
	const phoneAuth = new PhoneAuthService({ db });
	const hostAuth: HostAuthProvider = new CompositeHostAuthProvider([
		providers.hostAuth,
		new PhoneSessionAuthProvider(phoneAuth),
	]);
	// GitWatcher is the single source of truth for `.git/` and worktree fs
	// activity per workspace. Both EventBus (broadcasts to clients) and the
	// pull-requests runtime (event-driven branch sync) subscribe to it.
	const gitWatcher = new GitWatcher(db, filesystem);
	gitWatcher.start();
	const chatRuntime =
		options.chatRuntime ??
		new ChatRuntimeManager({
			db,
			runtimeResolver: providers.modelResolver,
		});
	// Provider auth (Anthropic / OpenAI OAuth + API keys) is per-machine, not
	// per-workspace. ChatService is a long-lived singleton wrapping mastra's
	// auth storage; the authenticated `auth.*` and `usage.*` routers proxy to it.
	const chatService = options.chatService ?? new ChatService();
	// ACP session runtime (docs/acp-sessions.md). Production talks to the
	// detached per-org ACP daemon, which owns adapters and active turns across
	// host-service/Desktop restarts. Tests may inject an in-process manager.
	// Desktop builds enable it through SUPERSET_ACP_SESSIONS=1. Keeping the
	// host-side capability switch lets standalone/test hosts explicitly disable
	// the surface without making ACP availability depend on a release channel.
	// Tests that inject a manager opt in implicitly.
	const acpSessionsEnabled =
		options.acpSessions !== undefined ||
		process.env.SUPERSET_ACP_SESSIONS === "1";
	const acpSessions =
		options.acpSessions ??
		new AcpDaemonClient({ organizationId: config.organizationId });

	// `runtime` is populated below once EventBus, Catalog, TerminalAgent
	// store, and Workspace Provisioning exist. Declared with `let` here
	// so members declared earlier (like chat) still have a shared shape.
	// eslint-disable-next-line prefer-const
	let runtime: HostServiceRuntime;
	const app = new Hono();
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

	// Phone frontend static bundle. Registered before CORS so preflight
	// requests aren't matched by the static handler; the bundle is served
	// same-origin so CORS doesn't apply anyway.
	if (config.webAppDir) {
		registerStaticAppRoute({ app, distDir: config.webAppDir });
	}

	app.use(
		"*",
		cors({
			origin: config.allowedOrigins,
			allowHeaders: [
				"Content-Type",
				"Authorization",
				"trpc-accept",
				"x-superset-client-machine-id",
			],
		}),
	);

	const eventBus = new EventBus({ db, filesystem, gitWatcher });
	eventBus.start();

	// Forward ACP session status transitions from the daemon (or an in-process
	// manager in tests) to the shared event bus. Sidebar and other host-wide
	// consumers react to this instead of polling `acpSessions.list`. When the
	// runtime doesn't expose the hook (older daemon builds that never emit),
	// the sidebar naturally falls back to its refetch cadence.
	if (acpSessionsEnabled) {
		acpSessions.onSessionChanged?.((event) => {
			eventBus.broadcastAcpSessionChanged({
				workspaceId: event.workspaceId,
				sessionId: event.sessionId,
				eventType: event.eventType,
				...(event.status !== undefined ? { status: event.status } : {}),
				occurredAt: event.occurredAt,
			});
		});
		acpSessions.onSessionOpenRequested?.((event) => {
			eventBus.broadcastAcpSessionOpenRequested(event);
		});
	}

	// Workspace Catalog Module (M1) — the sole normal writer of identity
	// and display columns. Constructed AFTER EventBus so catalog wake pings
	// have somewhere to fan out. The synchronous identity backfill runs
	// BEFORE tRPC routes accept requests so legacy rows always have a
	// canonical key by the time a caller queries `snapshot`.
	const catalog = new WorkspaceCatalog({ db, eventBus });
	try {
		runCatalogIdentityBackfill({ db, catalog });
	} catch (err) {
		console.warn("[host-service] catalog identity backfill failed:", err);
	}

	// Pull-request branch and repository metadata updates are catalog writes,
	// so the runtime starts only after the catalog and its event sink exist.
	const pullRequestRuntime = new PullRequestRuntimeManager({
		db,
		execGh,
		git,
		github,
		gitWatcher,
		catalog,
	});
	pullRequestRuntime.subscribeToWorkspaceEvents(eventBus);
	pullRequestRuntime.start();

	const terminalAgentPersistence = new SqliteTerminalAgentBindingPersistence(
		db,
	);
	// Hygiene only — reads hide defunct bindings via the session-liveness
	// join regardless, so a failure here must not block startup.
	try {
		terminalAgentPersistence.deleteDefunct();
	} catch (error) {
		console.warn(
			"[terminal-agents] failed to prune defunct binding rows",
			error,
		);
	}
	const terminalAgentStore = new TerminalAgentStore(terminalAgentPersistence);

	// Workspace Provisioning Module (M2) — the durable operation wrapper
	// around workspace/project creation. Uses appRouter.createCaller to
	// delegate to the existing tRPC mutations that still own git
	// materialization. Must be constructed AFTER catalog/eventBus/db/
	// terminalAgentStore because the runner captures them.
	const workspaceProvisioning: WorkspaceProvisioning =
		new WorkspaceProvisioning({
			db,
			catalog,
			eventBus,
			terminalRuntime: createProductionTerminalRuntime({
				db,
				eventBus,
				ctxFactory: () => ({
					git,
					credentials: providers.credentials,
					github,
					execGh,
					db,
					catalog,
					runtime,
					eventBus,
					terminalAgentStore,
					organizationId: config.organizationId,
					isAuthenticated: true,
					authKind: "psk",
					clientMachineId: undefined,
				}),
			}),
			gitFactory: git,
			runner: async (ctxArgs) => {
				const productionRunner = createProductionRunner({
					ctxFactory: () => ({
						git,
						credentials: providers.credentials,
						github,
						execGh,
						db,
						catalog,
						runtime,
						eventBus,
						terminalAgentStore,
						organizationId: config.organizationId,
						isAuthenticated: true,
						authKind: "psk",
						clientMachineId: undefined,
					}),
				});
				return productionRunner(ctxArgs);
			},
		});

	runtime = {
		acpSessions,
		acpSessionsEnabled,
		auth: chatService,
		chat: chatRuntime,
		filesystem,
		notificationHooks,
		phoneAuth,
		pullRequests: pullRequestRuntime,
		workspaceProvisioning,
		relayMailboxId: config.relayMailboxId,
	};

	// Local-first automations are evaluated by this host process. The scheduler
	// operates only on host.db and the local agent runtime; it never uses the
	// cloud API/relay, so schedules keep working while offline.
	const localAutomationScheduler = new LocalAutomationScheduler(() => ({
		db,
		eventBus,
		terminalAgentStore,
		runtime,
	}));
	localAutomationScheduler.start();

	// Resume sweep: any operation left `queued`/`running` from a previous
	// process is resumed from its durable request when possible; malformed
	// legacy rows are marked failed(retryable=true). Identity leases are
	// released before the runner is re-entered.
	try {
		runProvisioningResumeSweep({
			db,
			journal: workspaceProvisioning.journal,
			eventBus,
			resume: (operationId, request) =>
				workspaceProvisioning.resume(operationId, request),
		});
	} catch (err) {
		console.warn("[host-service] provisioning resume sweep failed:", err);
	}

	// Backfill `kind='main'` workspaces for projects already set up before this
	// column shipped. Run in the background; idempotent after the first upgrade.
	void runMainWorkspaceSweep({
		db,
		git,
		eventBus,
		catalog,
	}).catch((err) => {
		console.warn("[host-service] main-workspace sweep failed:", err);
	});

	const wsAuth =
		(options: { allowPhone: boolean }): MiddlewareHandler =>
		async (c, next) => {
			const headerResult = await hostAuth.validate(c.req.raw);
			if (headerResult.ok) {
				if (headerResult.kind === "phone" && !options.allowPhone) {
					return c.json({ error: "Forbidden" }, 403);
				}
				return next();
			}
			const token = c.req.query("token");
			if (token) {
				const queryResult = await hostAuth.validateToken(token);
				if (queryResult.ok) {
					if (queryResult.kind === "phone" && !options.allowPhone) {
						return c.json({ error: "Forbidden" }, 403);
					}
					return next();
				}
			}
			return c.json({ error: "Unauthorized" }, 401);
		};
	app.use("/terminal/*", async (c, next) => {
		// Paired phones may attach only to an existing workspace terminal. All
		// terminal REST endpoints and transient terminals remain desktop-only.
		const allowPhone = isPhoneWorkspaceTerminalWebSocketRequest({
			method: c.req.method,
			path: c.req.path,
			upgrade: c.req.header("upgrade"),
			workspaceId: c.req.query("workspaceId"),
		});
		return wsAuth({ allowPhone })(c, next);
	});
	app.use("/events", wsAuth({ allowPhone: false }));
	app.use("/acp-sessions/*", wsAuth({ allowPhone: true }));

	registerEventBusRoute({ app, eventBus, upgradeWebSocket });
	registerWorkspaceTerminalRoute({
		app,
		db,
		eventBus,
		upgradeWebSocket,
	});
	registerTransientTerminalRoute({ app, upgradeWebSocket });
	if (acpSessionsEnabled) {
		registerAcpSessionStreamRoute({
			app,
			sessions: acpSessions,
			upgradeWebSocket,
		});
	}

	app.use(
		"/trpc/*",
		trpcServer({
			router: appRouter,
			createContext: async (_opts, c) => {
				const authResult = await hostAuth.validate(c.req.raw);
				return {
					git,
					credentials: providers.credentials,
					github,
					execGh,
					db,
					catalog,
					runtime,
					eventBus,
					terminalAgentStore,
					organizationId: config.organizationId,
					isAuthenticated: authResult.ok,
					authKind: authResult.kind,
					clientMachineId:
						c.req.header("x-superset-client-machine-id") ?? undefined,
					remoteAddress: resolveRemoteAddress(c),
				} as Record<string, unknown>;
			},
		}),
	);

	const ownsDb = options.db === undefined;
	const dispose = async (): Promise<void> => {
		// Each step is best-effort and isolated: a throw in one cleanup must
		// not skip the others, otherwise a flaky `.stop()` could leak the
		// open SQLite handle for the rest of the process lifetime.
		try {
			localAutomationScheduler.stop();
		} catch (err) {
			console.warn("[host-service] localAutomationScheduler.stop failed:", err);
		}
		try {
			pullRequestRuntime.stop();
		} catch (err) {
			console.warn("[host-service] pullRequestRuntime.stop failed:", err);
		}
		try {
			await acpSessions.dispose();
		} catch (err) {
			console.warn("[host-service] acpSessions.dispose failed:", err);
		}
		try {
			eventBus.close();
		} catch (err) {
			console.warn("[host-service] eventBus.close failed:", err);
		}
		try {
			gitWatcher.close();
		} catch (err) {
			console.warn("[host-service] gitWatcher.close failed:", err);
		}
		if (ownsDb) {
			try {
				(db as unknown as { $client?: { close: () => void } }).$client?.close();
			} catch {
				// best-effort close; tests should not fail on teardown
			}
		}
	};

	return {
		app,
		injectWebSocket,
		db,
		notificationHookCapability: (terminalId) =>
			notificationHooks.capabilityForTerminal(terminalId),
		dispose,
	};
}

/**
 * Best-effort direct peer IP for per-request rate limiting. The embedded host
 * has no trusted reverse proxy, so forwarded headers are intentionally ignored.
 */
export function resolveRemoteAddress(c: { env?: unknown }): string | undefined {
	try {
		const info = getConnInfo(c as never);
		return info.remote.address ?? undefined;
	} catch {
		return undefined;
	}
}
