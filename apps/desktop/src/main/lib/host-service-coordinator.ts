import * as childProcess from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import path from "node:path";
import type { AppRouter } from "@superset/host-service";
import { settings } from "@superset/local-db";
import { getHostId, getHostName } from "@superset/shared/host-info";
import { createTRPCClient, httpLink } from "@trpc/client";
import { app, dialog } from "electron";
import log from "electron-log/main";
import { LOCAL_HOST_SCOPE_ID } from "shared/constants";
import { env as sharedEnv } from "shared/env.shared";
import superjson from "superjson";
import { SUPERSET_HOME_DIR } from "./app-environment";
import { isInternalBuild } from "./build-channel";
import { acquireSpawnLock } from "./host-service-lock";
import {
	isProcessAlive,
	killProcess,
	manifestDir,
	readManifest,
	removeManifest,
} from "./host-service-manifest";
import {
	HOST_SERVICE_RESPAWN_STABLE_MS,
	nextRespawnDelayMs,
} from "./host-service-respawn";
import {
	findFreePort,
	HEALTH_POLL_TIMEOUT_MS,
	MAX_HOST_LOG_BYTES,
	openRotatingLogFd,
	pollHealthCheck,
} from "./host-service-utils";
import { localDb } from "./local-db";
import { getProcessEnvWithShellPath } from "./shell-env";
import { HOOK_PROTOCOL_VERSION } from "./terminal/env";

export type HostServiceStatus = "starting" | "running" | "stopped";

export interface Connection {
	port: number;
	secret: string;
	machineId: string;
}

export interface HostServiceStatusEvent {
	status: HostServiceStatus;
	previousStatus: HostServiceStatus | null;
}

export type SpawnConfig = Record<string, never>;

interface RespawnState {
	attempts: number;
	timer: ReturnType<typeof setTimeout> | null;
	stableTimer: ReturnType<typeof setTimeout> | null;
}

interface HostServiceProcess {
	pid: number;
	port: number;
	secret: string;
	status: HostServiceStatus;
	/**
	 * True when this instance spawned the child and owns its lifecycle (may
	 * SIGTERM it and remove its manifest). False when the entry was *adopted*
	 * from another live app instance's host-service — we connect to it but must
	 * never kill it or delete its manifest.
	 */
	owned: boolean;
}

/**
 * Short health check used when deciding whether to adopt a foreign
 * host-service — the endpoint either answers within a couple of attempts or it
 * doesn't. Distinct from the long spawn readiness gate (HEALTH_POLL_TIMEOUT_MS).
 */
const ADOPT_HEALTH_TIMEOUT_MS = 2_500;

/**
 * How long a spawn lock may be held before another instance treats it as
 * wedged and steals it. A legitimate spawn holds the lock for the full health
 * poll window, so allow that plus margin.
 */
const SPAWN_LOCK_STALE_MS = HEALTH_POLL_TIMEOUT_MS + 5_000;

/** Overall budget for startOrAdopt to wait out a peer's in-flight spawn. */
const START_OR_ADOPT_DEADLINE_MS = SPAWN_LOCK_STALE_MS + HEALTH_POLL_TIMEOUT_MS;

/** Poll interval while waiting for a peer instance's spawn to go healthy. */
const ADOPT_WAIT_INTERVAL_MS = 250;

// High, uncommon user-space range: above usual web/dev server ports and below
// macOS's default ephemeral range, while still falling back if occupied.
const STABLE_PORT_BASE = 48_000;
const STABLE_PORT_COUNT = 1_000;

function getStablePort(): number {
	let hash = 2_166_136_261;
	for (let index = 0; index < LOCAL_HOST_SCOPE_ID.length; index++) {
		hash ^= LOCAL_HOST_SCOPE_ID.charCodeAt(index);
		hash = Math.imul(hash, 16_777_619);
	}
	return STABLE_PORT_BASE + ((hash >>> 0) % STABLE_PORT_COUNT);
}

function isValidPort(port: number | null | undefined): port is number {
	return (
		typeof port === "number" &&
		Number.isInteger(port) &&
		port > 0 &&
		port <= 65_535
	);
}

/**
 * Coupled to Electron: each child is spawned attached and SIGTERMed on
 * before-quit. PTYs survive across Electron restarts via the pty-daemon
 * layer host-service supervises, not via host-service itself. Manifests
 * are still written by the child for the CLI's benefit.
 */
export class HostServiceCoordinator extends EventEmitter {
	private instance: HostServiceProcess | null = null;
	private pendingStart: Promise<Connection> | null = null;
	private lastKnownPort: number | null = null;
	private scriptPath = path.join(__dirname, "host-service.js");
	private machineId = getHostId();
	private devReloadWatcher: fs.FSWatcher | null = null;
	private respawnState: RespawnState | null = null;
	private configProvider: (() => Promise<SpawnConfig | null>) | null = null;
	private scheduleRespawnTimer: (
		run: () => void,
		delayMs: number,
	) => ReturnType<typeof setTimeout> = (run, delayMs) =>
		setTimeout(run, delayMs);
	private stopDaemon: (connection: Connection) => Promise<void> = async (
		connection,
	) => {
		const client = createTRPCClient<AppRouter>({
			links: [
				httpLink({
					url: `http://127.0.0.1:${connection.port}/trpc`,
					transformer: superjson,
					headers: { Authorization: `Bearer ${connection.secret}` },
				}),
			],
		});
		await client.terminal.daemon.stop.mutate();
	};

	/** Supplies fresh credentials for automatic respawns. */
	setConfigProvider(provider: () => Promise<SpawnConfig | null>): void {
		this.configProvider = provider;
	}

	async start(config: SpawnConfig): Promise<Connection> {
		return this.startWithPreferredPorts(config);
	}

	private async startWithPreferredPorts(
		config: SpawnConfig,
		preferredPorts?: Iterable<number>,
	): Promise<Connection> {
		const existing = this.instance;
		if (existing?.status === "running") {
			// An adopted entry points at a foreign instance's child we don't
			// supervise (no exit handler). Re-validate it's still alive before
			// handing it back; if the owner died, drop it and start fresh.
			if (existing.owned || isProcessAlive(existing.pid)) {
				return {
					port: existing.port,
					secret: existing.secret,
					machineId: this.machineId,
				};
			}
			this.instance = null;
			this.emitStatus("stopped", "running");
		}

		if (this.pendingStart) return this.pendingStart;

		const startPromise = this.startOrAdopt(
			config,
			preferredPorts ?? this.getPreferredPorts(),
		);
		this.pendingStart = startPromise;

		try {
			return await startPromise;
		} finally {
			if (this.pendingStart === startPromise) this.pendingStart = null;
		}
	}

	private getPreferredPorts(): number[] {
		const ports = [this.instance?.port, this.lastKnownPort, getStablePort()];
		const uniquePorts: number[] = [];
		const seen = new Set<number>();

		for (const port of ports) {
			if (!isValidPort(port) || seen.has(port)) continue;
			seen.add(port);
			uniquePorts.push(port);
		}

		return uniquePorts;
	}

	private rememberPort(port: number): void {
		if (isValidPort(port)) this.lastKnownPort = port;
	}

	stop(): void {
		// A crashed child is removed before its timer fires, so this must happen
		// even when no instance is currently tracked.
		this.clearRespawnState();
		const instance = this.instance;
		if (!instance) return;

		const previousStatus = instance.status;
		instance.status = "stopped";
		this.rememberPort(instance.port);

		// Only owned children are ours to kill + de-manifest. Adopted entries
		// belong to another live app instance, so only drop our local reference.
		if (instance.owned) {
			try {
				killProcess(instance.pid, "SIGTERM");
			} catch {}
			removeManifest(LOCAL_HOST_SCOPE_ID);
		}

		this.instance = null;
		this.emitStatus("stopped", previousStatus);
	}

	/**
	 * Explicit full-quit path. The host kills every PTY and stops its daemon
	 * while its authenticated HTTP endpoint is still available.
	 */
	async shutdownPtyDaemon(): Promise<void> {
		const connection = this.getConnection();
		if (!connection) return;
		await Promise.allSettled([this.stopDaemon(connection)]);
	}

	async restart(config: SpawnConfig): Promise<Connection> {
		const preferredPorts = this.getPreferredPorts();
		this.stop();
		return this.startWithPreferredPorts(config, preferredPorts);
	}

	/** Forcefully reset the embedded host, including a stale manifested pid. */
	async reset(config: SpawnConfig): Promise<Connection> {
		const preferredPorts = this.getPreferredPorts();
		const manifestPid = readManifest(LOCAL_HOST_SCOPE_ID)?.pid;

		this.stop();

		if (manifestPid != null && isProcessAlive(manifestPid)) {
			try {
				killProcess(manifestPid, "SIGKILL");
			} catch (error) {
				log.warn(
					`[host-service] reset: SIGKILL of pid=${manifestPid} failed`,
					error,
				);
			}
		}

		removeManifest(LOCAL_HOST_SCOPE_ID);
		return this.startWithPreferredPorts(config, preferredPorts);
	}

	getConnection(): Connection | null {
		const instance = this.instance;
		if (!instance || instance.status !== "running") return null;
		return {
			port: instance.port,
			secret: instance.secret,
			machineId: this.machineId,
		};
	}

	getProcessStatus(): HostServiceStatus {
		if (this.pendingStart) return "starting";
		return this.instance?.status ?? "stopped";
	}

	/**
	 * Dev-only: watch the built host-service bundle and restart the running
	 * instance when it changes. Gives a fast edit→reload loop for code
	 * under packages/host-service and src/main/host-service without
	 * restarting Electron. In-memory host-service state (PTYs, watchers,
	 * chat streams) is torn down on each reload — this is not true HMR.
	 */
	enableDevReload(
		configProvider: () => Promise<SpawnConfig | null>,
	): () => void {
		if (this.devReloadWatcher) return () => {};

		const scriptDir = path.dirname(this.scriptPath);
		const scriptFile = path.basename(this.scriptPath);
		let debounce: ReturnType<typeof setTimeout> | null = null;
		let reloading = false;

		const waitForStableBundle = async (): Promise<boolean> => {
			const deadline = Date.now() + 5_000;
			let lastSize = -1;
			let stableSince = 0;
			while (Date.now() < deadline) {
				try {
					const stat = fs.statSync(this.scriptPath);
					if (stat.size > 0 && stat.size === lastSize) {
						if (Date.now() - stableSince >= 150) return true;
					} else {
						lastSize = stat.size;
						stableSince = Date.now();
					}
				} catch {
					lastSize = -1;
					stableSince = 0;
				}
				await new Promise((r) => setTimeout(r, 50));
			}
			return false;
		};

		const trigger = () => {
			if (debounce) clearTimeout(debounce);
			debounce = setTimeout(() => {
				void (async () => {
					if (reloading) return;
					if (this.getProcessStatus() === "stopped") return;
					reloading = true;
					try {
						const ready = await waitForStableBundle();
						if (!ready) {
							log.warn(
								"[host-service] bundle did not stabilize, skipping reload",
							);
							return;
						}
						const config = await configProvider();
						if (!config) return;
						log.info("[host-service] bundle changed, restarting embedded host");
						await this.restart(config);
					} catch (error) {
						log.error("[host-service] dev reload failed:", error);
					} finally {
						reloading = false;
					}
				})();
			}, 250);
		};

		try {
			this.devReloadWatcher = fs.watch(scriptDir, (_event, filename) => {
				if (filename && filename !== scriptFile) return;
				trigger();
			});
		} catch (error) {
			log.error("[host-service] failed to enable dev reload:", error);
			return () => {};
		}

		return () => {
			if (debounce) clearTimeout(debounce);
			this.devReloadWatcher?.close();
			this.devReloadWatcher = null;
		};
	}

	// ── Adopt + single-flight spawn ────────────────────────────────────

	/**
	 * Single-flight the embedded host across every app instance sharing this
	 * machine's `$SUPERSET_HOME_DIR`.
	 *
	 * First tries to adopt a healthy host-service another instance already
	 * spawned (reading its manifest for port + secret). Otherwise it takes a
	 * cross-process spawn lock and spawns; a peer that can't get the lock waits
	 * for the winner's manifest to go healthy and adopts it, so only one child
	 * is ever spawned. Stale/dead-owner locks are stolen so a crashed or
	 * wedged instance never wedges everyone else.
	 */
	private async startOrAdopt(
		config: SpawnConfig,
		preferredPorts: Iterable<number>,
	): Promise<Connection> {
		const adopted = await this.tryAdopt();
		if (adopted) return adopted;

		const deadline = Date.now() + START_OR_ADOPT_DEADLINE_MS;
		for (;;) {
			const lock = acquireSpawnLock(LOCAL_HOST_SCOPE_ID, {
				staleMs: SPAWN_LOCK_STALE_MS,
			});
			if (lock) {
				try {
					// A peer may have finished spawning between our first adopt
					// attempt and taking the lock — re-check before spawning.
					const raced = await this.tryAdopt();
					if (raced) return raced;
					return await this.spawn(config, preferredPorts);
				} finally {
					lock.release();
				}
			}

			// A live peer holds the lock and is mid-spawn: wait for its manifest
			// to become healthy, then adopt it.
			const peer = await this.tryAdopt();
			if (peer) return peer;

			if (Date.now() >= deadline) {
				throw new Error(
					"Timed out waiting to start or adopt the embedded host service",
				);
			}
			await new Promise((r) => setTimeout(r, ADOPT_WAIT_INTERVAL_MS));
		}
	}

	/**
	 * Adopt a host-service another live app instance spawned, if its manifest
	 * points at a healthy endpoint. Registers a foreign-owned in-process entry
	 * and returns its connection, or null when there's nothing healthy to adopt.
	 */
	private async tryAdopt(): Promise<Connection | null> {
		const manifest = readManifest(LOCAL_HOST_SCOPE_ID);
		if (!manifest) return null;

		let port: number;
		try {
			port = Number(new URL(manifest.endpoint).port);
		} catch {
			return null;
		}
		if (!isValidPort(port)) return null;

		const healthy = await pollHealthCheck(
			manifest.endpoint,
			manifest.authToken,
			ADOPT_HEALTH_TIMEOUT_MS,
		);
		if (!healthy) return null;

		const previous = this.instance;
		this.instance = {
			pid: manifest.pid,
			port,
			secret: manifest.authToken,
			status: "running",
			owned: false,
		};
		this.rememberPort(port);
		this.emitStatus("running", previous?.status ?? null);

		log.info(
			`[host-service] adopted existing host on port ${port} (pid ${manifest.pid})`,
		);
		return { port, secret: manifest.authToken, machineId: this.machineId };
	}

	// ── Spawn ─────────────────────────────────────────────────────────

	private async spawn(
		config: SpawnConfig,
		preferredPorts: Iterable<number> = this.getPreferredPorts(),
	): Promise<Connection> {
		const port = await findFreePort(preferredPorts);
		this.rememberPort(port);
		const secret = randomBytes(32).toString("hex");

		const instance: HostServiceProcess = {
			pid: 0,
			port,
			secret,
			status: "starting",
			owned: true,
		};
		this.instance = instance;
		this.emitStatus("starting", null);

		const childEnv = await this.buildEnv(port, secret, config);
		const logFd = openRotatingLogFd(
			path.join(manifestDir(LOCAL_HOST_SCOPE_ID), "host-service.log"),
			MAX_HOST_LOG_BYTES,
		);
		// Dev: pipe child stdout/stderr through this process so log lines
		// land in the developer's `bun dev` terminal. Production: hard-back
		// stdio with the rotating log file.
		const isDev = !app.isPackaged;
		const stdio: childProcess.StdioOptions = isDev
			? ["ignore", "pipe", "pipe"]
			: logFd >= 0
				? ["ignore", logFd, logFd]
				: ["ignore", "ignore", "ignore"];

		let child: ReturnType<typeof childProcess.spawn>;
		try {
			child = childProcess.spawn(process.execPath, [this.scriptPath], {
				detached: false,
				stdio,
				env: childEnv,
				// Avoid a flashing CMD window on Windows.
				windowsHide: true,
			});
		} finally {
			if (logFd >= 0) {
				try {
					fs.closeSync(logFd);
				} catch {
					// Best-effort — child has its own dup of the fd.
				}
			}
		}

		// In dev, fan child output through to parent stdout/stderr with a
		// prefix so it's identifiable in `bun dev`.
		if (isDev && child.stdout && child.stderr) {
			const tag = "[hs:local]";
			pipeWithPrefix(child.stdout, process.stdout, tag);
			pipeWithPrefix(child.stderr, process.stderr, tag);
		}

		const childPid = child.pid;
		if (!childPid) {
			this.instance = null;
			throw new Error("Failed to spawn host service process");
		}

		instance.pid = childPid;
		let childExited = false;
		child.on("exit", (code, signal) => {
			childExited = true;
			this.handleChildExit(childPid, code, signal);
		});
		// Don't let the child block Electron's exit — stop() handles teardown.
		child.unref();

		const endpoint = `http://127.0.0.1:${port}`;
		const healthy = await pollHealthCheck(
			endpoint,
			secret,
			HEALTH_POLL_TIMEOUT_MS,
			() => childExited,
		);
		if (!healthy) {
			if (!childExited) child.kill("SIGTERM");
			this.instance = null;
			throw new Error(
				childExited
					? "Host service process exited during startup"
					: `Host service failed to start within ${HEALTH_POLL_TIMEOUT_MS}ms`,
			);
		}

		instance.status = "running";

		log.info(`[host-service] listening on port ${port}`);
		this.emitStatus("running", "starting");
		return { port, secret, machineId: this.machineId };
	}

	private async buildEnv(
		port: number,
		secret: string,
		_config: SpawnConfig,
	): Promise<Record<string, string>> {
		const scopeDir = manifestDir(LOCAL_HOST_SCOPE_ID);
		const row = localDb.select().from(settings).get();

		const childEnv = await getProcessEnvWithShellPath({
			...(process.env as Record<string, string>),
			ELECTRON_RUN_AS_NODE: "1",
			NODE_ENV: app.isPackaged
				? "production"
				: (process.env.NODE_ENV ?? "development"),
			ORGANIZATION_ID: LOCAL_HOST_SCOPE_ID,
			HOST_CLIENT_ID: getHostId(),
			HOST_NAME: getHostName(),
			HOST_SERVICE_SECRET: secret,
			AUTOMATE_RELAY_URL: isInternalBuild()
				? (process.env.AUTOMATE_RELAY_URL ?? "")
				: "",
			HOST_SERVICE_PORT: String(port),
			// Internal builds expose the authenticated phone surface on the LAN.
			// Stable builds retain the loopback-only boundary.
			HOST_SERVICE_HOSTNAME: isInternalBuild() ? "0.0.0.0" : "127.0.0.1",
			SUPERSET_WEB_APP_DIR: app.isPackaged
				? path.join(process.resourcesPath, "resources/web")
				: path.join(app.getAppPath(), "dist/resources/web"),
			HOST_MANIFEST_DIR: scopeDir,
			HOST_DB_PATH: path.join(scopeDir, "host.db"),
			HOST_MIGRATIONS_FOLDER: app.isPackaged
				? path.join(process.resourcesPath, "resources/host-migrations")
				: path.join(app.getAppPath(), "../../packages/host-service/drizzle"),
			DESKTOP_VITE_PORT: String(sharedEnv.DESKTOP_VITE_PORT),
			SUPERSET_HOME_DIR: SUPERSET_HOME_DIR,
			SUPERSET_USE_ACP_FOR_AGENT_PRESETS: row?.useAcpForAgentPresets
				? "1"
				: "0",
			SUPERSET_AGENT_HOOK_PORT: String(sharedEnv.DESKTOP_NOTIFICATIONS_PORT),
			SUPERSET_AGENT_HOOK_VERSION: HOOK_PROTOCOL_VERSION,
			// ACP sessions are a core host-service capability in every desktop
			// distribution. The agent-preset setting above only selects its launch
			// path; it must not control ACP availability.
			SUPERSET_ACP_SESSIONS: "1",
			// Read by the child's parent watchdog so it can self-exit if
			// Electron crashes without sending SIGTERM (orphan reparenting).
			HOST_PARENT_PID: String(process.pid),
		});

		// The embedded host is credential-free. The shell environment is
		// inherited, so remove legacy auth explicitly.
		delete childEnv.AUTH_TOKEN;

		// Pin external CLI paths using the augmented shell PATH. Packaged
		// Electron builds sometimes lose NVM/Homebrew entries even after shell
		// environment setup. Both lookups are best-effort and retain their
		// existing configured values as fallbacks.
		const [claudePath, mfcliPath] = await Promise.all([
			resolveCliPath("claude", childEnv, childEnv.CLAUDE_CODE_EXECUTABLE),
			resolveCliPath("mfcli", childEnv, childEnv.SUPERSET_MFCLI_TITLE_COMMAND),
		]);
		if (claudePath) childEnv.CLAUDE_CODE_EXECUTABLE = claudePath;
		if (mfcliPath) childEnv.SUPERSET_MFCLI_TITLE_COMMAND = mfcliPath;

		return childEnv;
	}

	// ── Events ────────────────────────────────────────────────────────

	private emitStatus(
		status: HostServiceStatus,
		previousStatus: HostServiceStatus | null,
	): void {
		this.emit("status-changed", {
			status,
			previousStatus,
		} satisfies HostServiceStatusEvent);
	}

	private handleChildExit(
		childPid: number,
		code: number | null,
		signal: NodeJS.Signals | null,
	): void {
		log.info(`[host-service] exited with code ${code} signal ${signal}`);
		const current = this.instance;
		if (!current || current.pid !== childPid || current.status === "stopped")
			return;

		const previousStatus = current.status;
		this.rememberPort(current.port);
		this.instance = null;
		removeManifest(LOCAL_HOST_SCOPE_ID);
		this.emitStatus("stopped", previousStatus);
		if (previousStatus !== "running") return;

		const cause =
			signal != null ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
		log.error(`[host-service] crashed (${cause})`);
		this.scheduleRespawn(cause);
	}

	private scheduleRespawn(cause: string): void {
		const state = this.respawnState ?? {
			attempts: 0,
			timer: null,
			stableTimer: null,
		};
		this.respawnState = state;

		const delay = nextRespawnDelayMs(state.attempts);
		if (delay === null) {
			log.error(
				`[host-service] giving up after ${state.attempts} respawn attempts`,
			);
			this.clearRespawnState();
			this.alertChildCrashed(cause);
			return;
		}

		state.attempts += 1;
		const attempt = state.attempts;
		log.info(
			`[host-service] respawn attempt ${attempt} in ${Math.round(delay)}ms`,
		);
		if (state.timer) clearTimeout(state.timer);
		state.timer = this.scheduleRespawnTimer(() => {
			state.timer = null;
			void this.respawn(attempt, state);
		}, delay);
		state.timer.unref?.();
	}

	private async respawn(attempt: number, state: RespawnState): Promise<void> {
		const cancelled = () => this.respawnState !== state;
		if (!this.configProvider) {
			log.error("[host-service] cannot respawn: no config provider registered");
			this.clearRespawnState();
			this.alertChildCrashed("no config provider");
			return;
		}

		try {
			const config = await this.configProvider();
			if (cancelled()) return;
			if (!config) {
				log.warn(
					`[host-service] respawn attempt ${attempt}: no config available`,
				);
				this.scheduleRespawn("no config available");
				return;
			}
			await this.startWithPreferredPorts(config, this.getPreferredPorts());
			if (cancelled()) {
				this.stop();
				return;
			}
			log.info(`[host-service] respawned on attempt ${attempt}`);
			this.armRespawnBudgetReset();
		} catch (error) {
			if (cancelled()) return;
			log.error(`[host-service] respawn attempt ${attempt} failed:`, error);
			this.scheduleRespawn(`respawn attempt ${attempt} failed`);
		}
	}

	private armRespawnBudgetReset(): void {
		const state = this.respawnState;
		const instance = this.instance;
		if (!state || instance?.status !== "running") return;
		if (state.stableTimer) clearTimeout(state.stableTimer);
		state.stableTimer = this.scheduleRespawnTimer(() => {
			if (
				this.respawnState === state &&
				this.instance === instance &&
				instance.status === "running"
			) {
				this.clearRespawnState();
			}
		}, HOST_SERVICE_RESPAWN_STABLE_MS);
		state.stableTimer.unref?.();
	}

	private clearRespawnState(): void {
		const state = this.respawnState;
		if (!state) return;
		if (state.timer) clearTimeout(state.timer);
		if (state.stableTimer) clearTimeout(state.stableTimer);
		this.respawnState = null;
	}

	private alertChildCrashed(cause: string): void {
		void dialog.showMessageBox({
			type: "error",
			title: "Host service crashed",
			message: `The Superset host service for Local stopped unexpectedly (${cause}) and could not be restarted automatically.`,
			detail:
				"Its workspaces and terminals are unavailable until it restarts — use the Superset tray menu > Host Service > Restart.",
		});
	}
}

/**
 * Forward child stdout/stderr to a parent stream with a per-line prefix.
 * Plain `chunk => parent.write(`${tag} ${chunk}`)` only prefixes the first
 * line in a chunk and breaks visual scanning when child output bursts.
 */
function pipeWithPrefix(
	source: NodeJS.ReadableStream,
	target: NodeJS.WritableStream,
	tag: string,
): void {
	let pending = "";
	source.on("data", (chunk: Buffer) => {
		const text = pending + chunk.toString("utf8");
		const lines = text.split("\n");
		// Last element is a partial line if input doesn't end with \n;
		// stash it for the next chunk.
		pending = lines.pop() ?? "";
		for (const line of lines) {
			target.write(`${tag} ${line}\n`);
		}
	});
	source.on("end", () => {
		if (pending) target.write(`${tag} ${pending}\n`);
		pending = "";
	});
}

let coordinator: HostServiceCoordinator | null = null;

export function getHostServiceCoordinator(): HostServiceCoordinator {
	if (!coordinator) {
		coordinator = new HostServiceCoordinator();
	}
	return coordinator;
}

/** Resolve an absolute CLI path from the augmented child environment. */
async function resolveCliPath(
	command: string,
	env: Record<string, string>,
	configuredPath?: string,
): Promise<string | null> {
	if (configuredPath) return configuredPath;
	const probe = process.platform === "win32" ? "where" : "which";
	try {
		const stdout = await new Promise<string>((resolve, reject) => {
			const child = childProcess.execFile(
				probe,
				[command],
				{ env, timeout: 5_000, encoding: "utf8" },
				(error, out) => {
					if (error) reject(error);
					else resolve(out);
				},
			);
			child.on("error", reject);
		});
		const first = stdout
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find(Boolean);
		return first || null;
	} catch (error) {
		log.debug(
			`[host-service-coordinator] ${command} lookup failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}
