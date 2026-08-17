import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { dialog } from "electron";

process.env.SUPERSET_TEST_APP_NAME = "Superset";
process.env.SUPERSET_TEST_APP_VERSION = "1.2.3";
const originalResourcesPath = (
	process as typeof process & { resourcesPath?: string }
).resourcesPath;
let killedPids: Array<{ pid: number; signal: NodeJS.Signals | number }> = [];
let killProcessError: NodeJS.ErrnoException | null = null;

const manifestStore: {
	current: {
		pid: number;
		endpoint: string;
		authToken: string;
		startedAt: number;
		organizationId: string;
	} | null;
} = { current: null };

let testManifestRoot = "";

const readManifestMock = mock(() => manifestStore.current);
const removeManifestMock = mock(() => {
	manifestStore.current = null;
});
const isProcessAliveMock = mock(() => true);
const killProcessMock = mock((pid: number, signal: NodeJS.Signals | number) => {
	if (killProcessError) {
		const error = killProcessError;
		killProcessError = null;
		throw error;
	}
	killedPids.push({ pid, signal });
});

const realHostServiceManifest = await import("./host-service-manifest");
mock.module("./host-service-manifest", () => ({
	...realHostServiceManifest,
	readManifest: readManifestMock,
	removeManifest: removeManifestMock,
	isProcessAlive: isProcessAliveMock,
	killProcess: killProcessMock,
	manifestDir: (orgId: string) => path.join(testManifestRoot, orgId),
}));

const pollHealthCheckMock = mock(() => Promise.resolve(true));
const showAlertMock = mock(async () => ({
	response: 0,
	checkboxChecked: false,
}));
dialog.showMessageBox = showAlertMock;

const realHostServiceUtils = await import("./host-service-utils");
mock.module("./host-service-utils", () => ({
	...realHostServiceUtils,
	HEALTH_POLL_TIMEOUT_MS: 10_000,
	MAX_HOST_LOG_BYTES: 1024,
	findFreePort: mock(() => Promise.resolve(40000)),
	openRotatingLogFd: mock(() => -1),
	pollHealthCheck: pollHealthCheckMock,
}));

mock.module("electron-log/main", () => ({
	default: {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
	},
}));

const realHostInfo = await import("@superset/shared/host-info");
mock.module("@superset/shared/host-info", () => ({
	...realHostInfo,
	getHostId: () => "host-1",
	getHostName: () => "host",
}));
mock.module("./local-db", () => ({
	localDb: {
		select: () => ({
			from: () => ({ get: () => null, where: () => ({ get: () => null }) }),
		}),
	},
}));

const realShellEnv = await import("./shell-env");
mock.module("./shell-env", () => ({
	...realShellEnv,
	getProcessEnvWithShellPath: mock(async (env: Record<string, string>) => ({
		...env,
	})),
}));

const { HOST_SERVICE_RESPAWN_MAX_ATTEMPTS } = await import(
	"./host-service-respawn"
);
const { HostServiceCoordinator } = await import("./host-service-coordinator");

const baseManifest = (pid: number, endpoint = "http://127.0.0.1:55555") => ({
	pid,
	endpoint,
	authToken: "manifest-secret",
	startedAt: 0,
	organizationId: "org-1",
});

const spawnConfig = {};

interface HostServiceCoordinatorInternals {
	getPreferredPorts(): number[];
	rememberPort(port: number): void;
	buildEnv(
		port: number,
		secret: string,
		config: typeof spawnConfig,
	): Promise<Record<string, string>>;
}

function resetMocks(): void {
	delete process.env.SUPERSET_TEST_APP_PACKAGED;
	delete process.env.AUTOMATE_RELAY_URL;
	manifestStore.current = null;
	readManifestMock.mockClear();
	removeManifestMock.mockClear();
	isProcessAliveMock.mockClear();
	isProcessAliveMock.mockImplementation(() => true);
	killProcessMock.mockClear();
	pollHealthCheckMock.mockClear();
	pollHealthCheckMock.mockImplementation(() => Promise.resolve(true));
	readManifestMock.mockClear();
	readManifestMock.mockImplementation(() => manifestStore.current);
	killedPids = [];
	killProcessError = null;
	showAlertMock.mockClear();
}

describe("HostServiceCoordinator preferred ports", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		coordinator = new HostServiceCoordinator();
	});

	afterEach(() => {
		coordinator.stop();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("prefers the last known port, then the stable local scope port", () => {
		const internals = coordinator as unknown as HostServiceCoordinatorInternals;
		internals.rememberPort(46666);

		const ports = internals.getPreferredPorts();

		expect(ports[0]).toBe(46666);
		expect(ports[1]).toBeGreaterThanOrEqual(48_000);
		expect(ports[1]).toBeLessThan(49_000);
	});

	test("uses a deterministic stable port when no previous port exists", () => {
		const internals = coordinator as unknown as HostServiceCoordinatorInternals;

		const ports = internals.getPreferredPorts();
		const secondRead = internals.getPreferredPorts();

		expect(ports).toEqual(secondRead);
		expect(ports).toHaveLength(1);
		expect(ports[0]).toBeGreaterThanOrEqual(48_000);
		expect(ports[0]).toBeLessThan(49_000);
	});
});

describe("HostServiceCoordinator ACP environment", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		(process as typeof process & { resourcesPath?: string }).resourcesPath =
			"/tmp/resources";
		coordinator = new HostServiceCoordinator();
	});

	afterEach(() => {
		coordinator.stop();
		fs.rmSync(testManifestRoot, { recursive: true, force: true });
		testManifestRoot = "";
		(process as typeof process & { resourcesPath?: string }).resourcesPath =
			originalResourcesPath;
	});

	test("enables ACP sessions for packaged stable builds", async () => {
		process.env.SUPERSET_TEST_APP_PACKAGED = "1";
		process.env.AUTOMATE_RELAY_URL = "wss://relay.example.test/task";
		const internals = coordinator as unknown as HostServiceCoordinatorInternals;

		const env = await internals.buildEnv(40000, "secret", spawnConfig);

		expect(env.SUPERSET_ACP_SESSIONS).toBe("1");
		expect(env.HOST_SERVICE_HOSTNAME).toBe("127.0.0.1");
		expect(env.AUTOMATE_RELAY_URL).toBe("wss://relay.example.test/task");
	});
});

describe("HostServiceCoordinator.reset", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let spawnMock: ReturnType<typeof mock>;

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));

		coordinator = new HostServiceCoordinator();
		spawnMock = mock(async () => ({
			port: 60000,
			secret: "fresh-secret",
			machineId: "host-1",
		}));
		(coordinator as unknown as { spawn: typeof spawnMock }).spawn = spawnMock;
	});

	afterEach(() => {
		coordinator.stop();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("removes manifest, SIGKILLs live pid, then spawns fresh", async () => {
		manifestStore.current = baseManifest(8888);

		const conn = await coordinator.reset(spawnConfig);

		expect(killedPids).toContainEqual({ pid: 8888, signal: "SIGKILL" });
		expect(removeManifestMock).toHaveBeenCalled();
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
		expect(conn.secret).toBe("fresh-secret");
	});

	test("swallows SIGKILL ESRCH (pid already gone) and still respawns", async () => {
		manifestStore.current = baseManifest(7777);
		const err: NodeJS.ErrnoException = new Error("kill ESRCH");
		err.code = "ESRCH";
		killProcessError = err;

		const conn = await coordinator.reset(spawnConfig);

		expect(killProcessMock).toHaveBeenCalledWith(7777, "SIGKILL");
		expect(removeManifestMock).toHaveBeenCalled();
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("is safe when no manifest exists — no kill, still spawns", async () => {
		manifestStore.current = null;

		const conn = await coordinator.reset(spawnConfig);

		expect(killedPids).toHaveLength(0);
		// removeManifest is called unconditionally — that's fine, the impl
		// in host-service-manifest treats a missing file as a no-op.
		expect(removeManifestMock).toHaveBeenCalled();
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("skips SIGKILL when the manifest pid is no longer alive", async () => {
		manifestStore.current = baseManifest(9999);
		isProcessAliveMock.mockImplementationOnce(() => false);

		const conn = await coordinator.reset(spawnConfig);

		expect(killedPids).toHaveLength(0);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});
});

interface AdoptableInstance {
	pid: number;
	port: number;
	secret: string;
	status: "running" | "starting" | "stopped";
	owned: boolean;
}

interface AdoptableInternals {
	instance: AdoptableInstance | null;
	adoptedRecovery: Promise<void> | null;
	spawn: ReturnType<typeof mock>;
	superviseAdoptedInstance(instance: AdoptableInstance): Promise<void>;
}

describe("HostServiceCoordinator single-flight / adoption", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let spawnMock: ReturnType<typeof mock>;

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		coordinator = new HostServiceCoordinator();
		spawnMock = mock(async () => ({
			port: 60000,
			secret: "fresh-secret",
			machineId: "host-1",
		}));
		(coordinator as unknown as AdoptableInternals).spawn = spawnMock;
	});

	afterEach(() => {
		coordinator.stop();
		if (testManifestRoot) {
			fs.rmSync(testManifestRoot, { recursive: true, force: true });
			testManifestRoot = "";
		}
	});

	test("adopts a healthy foreign host-service instead of spawning", async () => {
		manifestStore.current = baseManifest(4321, "http://127.0.0.1:55555");
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(true));

		const conn = await coordinator.start(spawnConfig);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(conn.port).toBe(55555);
		expect(conn.secret).toBe("manifest-secret");

		const internals = coordinator as unknown as AdoptableInternals;
		expect(internals.instance?.owned).toBe(false);
	});

	test("spawns when the manifest health-check fails", async () => {
		manifestStore.current = baseManifest(4321, "http://127.0.0.1:55555");
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));

		const conn = await coordinator.start(spawnConfig);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("does not adopt a healthy endpoint whose manifested owner pid is dead", async () => {
		manifestStore.current = baseManifest(4321, "http://127.0.0.1:55555");
		isProcessAliveMock.mockImplementation(() => false);

		const conn = await coordinator.start(spawnConfig);

		expect(pollHealthCheckMock).not.toHaveBeenCalled();
		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("adopter B clears owner A's stale connection and recovers through startOrAdopt", async () => {
		const internals = coordinator as unknown as AdoptableInternals & {
			startOrAdopt: ReturnType<typeof mock>;
		};
		const adopted: AdoptableInstance = {
			pid: 4321,
			port: 55555,
			secret: "manifest-secret",
			status: "running",
			owned: false,
		};
		internals.instance = adopted;
		isProcessAliveMock.mockImplementation(() => false);
		coordinator.setConfigProvider(async () => spawnConfig);
		internals.startOrAdopt = mock(async () => ({
			port: 60000,
			secret: "replacement",
			machineId: "host-1",
		}));

		await internals.superviseAdoptedInstance(adopted);
		await internals.adoptedRecovery;

		expect(internals.instance).toBeNull();
		expect(internals.startOrAdopt).toHaveBeenCalledTimes(1);
	});

	test("coalesces concurrent stale-adoption recovery into one start", async () => {
		const internals = coordinator as unknown as AdoptableInternals & {
			startOrAdopt: ReturnType<typeof mock>;
		};
		const adopted: AdoptableInstance = {
			pid: 4321,
			port: 55555,
			secret: "manifest-secret",
			status: "running",
			owned: false,
		};
		internals.instance = adopted;
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		coordinator.setConfigProvider(async () => spawnConfig);
		internals.startOrAdopt = mock(async () => ({
			port: 60000,
			secret: "replacement",
			machineId: "host-1",
		}));

		await Promise.all([
			internals.superviseAdoptedInstance(adopted),
			internals.superviseAdoptedInstance(adopted),
		]);
		await internals.adoptedRecovery;

		expect(internals.startOrAdopt).toHaveBeenCalledTimes(1);
	});

	test("under-lock double-check adopts a manifest that appears after the first miss", async () => {
		manifestStore.current = baseManifest(4321, "http://127.0.0.1:55555");
		// Outer adopt attempt sees nothing; the re-check under the lock does.
		readManifestMock.mockImplementationOnce(() => null);
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(true));

		const conn = await coordinator.start(spawnConfig);

		expect(spawnMock).not.toHaveBeenCalled();
		expect(conn.port).toBe(55555);
	});

	test("coalesces concurrent starts into one embedded host spawn", async () => {
		manifestStore.current = null;
		let releaseSpawn: () => void = () => {};
		spawnMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					releaseSpawn = () =>
						resolve({
							port: 60000,
							secret: "fresh-secret",
							machineId: "host-1",
						});
				}),
		);

		const first = coordinator.start(spawnConfig);
		const second = coordinator.start(spawnConfig);
		for (
			let attempt = 0;
			attempt < 10 && spawnMock.mock.calls.length === 0;
			attempt++
		) {
			await Promise.resolve();
		}
		expect(spawnMock).toHaveBeenCalledTimes(1);

		releaseSpawn();
		expect(await first).toEqual(await second);
	});

	test("stop waits for a pending start and prevents it from publishing", async () => {
		manifestStore.current = null;
		let releaseSpawn: () => void = () => {};
		spawnMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					releaseSpawn = () =>
						resolve({
							port: 60000,
							secret: "fresh-secret",
							machineId: "host-1",
						});
				}),
		);

		const start = coordinator.start(spawnConfig);
		for (
			let attempt = 0;
			attempt < 10 && spawnMock.mock.calls.length === 0;
			attempt++
		) {
			await Promise.resolve();
		}
		const stopped = coordinator.stop();
		let stopSettled = false;
		void stopped.then(() => {
			stopSettled = true;
		});
		await Promise.resolve();
		expect(stopSettled).toBe(false);

		releaseSpawn();
		await expect(start).rejects.toThrow("lifecycle was stopped");
		await stopped;
		expect(coordinator.getConnection()).toBeNull();
	});

	test("stop during adoption health check prevents late adoption", async () => {
		manifestStore.current = baseManifest(4321, "http://127.0.0.1:55555");
		let finishHealthCheck: (healthy: boolean) => void = () => {};
		pollHealthCheckMock.mockImplementation(
			() =>
				new Promise<boolean>((resolve) => {
					finishHealthCheck = resolve;
				}),
		);

		const start = coordinator.start(spawnConfig);
		await Promise.resolve();
		const stopped = coordinator.stop();
		finishHealthCheck(true);

		await expect(start).rejects.toThrow("lifecycle was stopped");
		await stopped;
		expect(spawnMock).not.toHaveBeenCalled();
		expect((coordinator as unknown as AdoptableInternals).instance).toBeNull();
	});

	test("stop cancels pending adopted recovery before it can start", async () => {
		const internals = coordinator as unknown as AdoptableInternals & {
			startOrAdopt: ReturnType<typeof mock>;
		};
		const adopted: AdoptableInstance = {
			pid: 4321,
			port: 55555,
			secret: "manifest-secret",
			status: "running",
			owned: false,
		};
		internals.instance = adopted;
		pollHealthCheckMock.mockImplementation(() => Promise.resolve(false));
		let releaseConfig: () => void = () => {};
		coordinator.setConfigProvider(
			() =>
				new Promise((resolve) => {
					releaseConfig = () => resolve(spawnConfig);
				}),
		);
		internals.startOrAdopt = mock(async () => ({
			port: 60000,
			secret: "replacement",
			machineId: "host-1",
		}));

		await internals.superviseAdoptedInstance(adopted);
		const stopped = coordinator.stop();
		releaseConfig();
		await stopped;

		expect(internals.startOrAdopt).not.toHaveBeenCalled();
		expect(internals.instance).toBeNull();
	});

	test("adopted fast-path drops a dead foreign entry and re-spawns", async () => {
		const internals = coordinator as unknown as AdoptableInternals;
		internals.instance = {
			pid: 4321,
			port: 55555,
			secret: "manifest-secret",
			status: "running",
			owned: false,
		};
		manifestStore.current = null;
		isProcessAliveMock.mockImplementation(() => false);

		const conn = await coordinator.start(spawnConfig);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(conn.port).toBe(60000);
	});

	test("stop on an adopted entry does not SIGTERM and keeps the manifest", () => {
		const internals = coordinator as unknown as AdoptableInternals;
		internals.instance = {
			pid: 4321,
			port: 55555,
			secret: "manifest-secret",
			status: "running",
			owned: false,
		};

		coordinator.stop();

		expect(killedPids).toHaveLength(0);
		expect(removeManifestMock).not.toHaveBeenCalled();
		expect(internals.instance).toBeNull();
	});

	test("stop on an owned entry SIGTERMs the child and removes the manifest", () => {
		const internals = coordinator as unknown as AdoptableInternals;
		internals.instance = {
			pid: 4321,
			port: 55555,
			secret: "own-secret",
			status: "running",
			owned: true,
		};

		coordinator.stop();

		expect(killedPids).toContainEqual({ pid: 4321, signal: "SIGTERM" });
		expect(removeManifestMock).toHaveBeenCalled();
		expect(internals.instance).toBeNull();
	});
});

describe("HostServiceCoordinator full quit", () => {
	test("asks the running embedded host to kill sessions and stop its daemon", async () => {
		resetMocks();
		const coordinator = new HostServiceCoordinator();
		const internals = coordinator as unknown as AdoptableInternals & {
			stopDaemon: ReturnType<typeof mock>;
		};
		internals.instance = {
			pid: 1001,
			port: 51001,
			secret: "secret-1",
			status: "running",
			owned: true,
		};
		internals.stopDaemon = mock(async () => {});

		await coordinator.shutdownPtyDaemon();

		expect(internals.stopDaemon).toHaveBeenCalledTimes(1);
		expect(internals.stopDaemon).toHaveBeenCalledWith({
			port: 51001,
			secret: "secret-1",
			machineId: "host-1",
		});
	});
});

describe("HostServiceCoordinator crash respawn", () => {
	let coordinator: InstanceType<typeof HostServiceCoordinator>;
	let internals: {
		instance: AdoptableInternals["instance"];
		respawnState: {
			attempts: number;
			timer: unknown;
			stableTimer: unknown;
		} | null;
		handleChildExit(
			childPid: number,
			code: number | null,
			signal: NodeJS.Signals | null,
		): void;
	};
	let pendingTimers: Array<{ run: () => void; delayMs: number }>;
	let startMock: ReturnType<typeof mock>;

	function trackRunning(pid: number): void {
		internals.instance = {
			pid,
			port: 55555,
			secret: "secret",
			status: "running",
			owned: true,
		};
	}

	async function flushTimer(): Promise<void> {
		const timer = pendingTimers.shift();
		if (!timer) throw new Error("no respawn timer was scheduled");
		timer.run();
		await Promise.resolve();
		await Promise.resolve();
	}

	beforeEach(() => {
		resetMocks();
		testManifestRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hsc-test-"));
		coordinator = new HostServiceCoordinator();
		internals = coordinator as unknown as typeof internals;
		pendingTimers = [];
		(
			coordinator as unknown as {
				scheduleRespawnTimer: (
					run: () => void,
					delayMs: number,
				) => ReturnType<typeof setTimeout>;
			}
		).scheduleRespawnTimer = (run, delayMs) => {
			pendingTimers.push({ run, delayMs });
			return { unref() {} } as unknown as ReturnType<typeof setTimeout>;
		};
		startMock = mock(async () => {
			internals.instance = {
				pid: 60001,
				port: 60000,
				secret: "fresh",
				status: "running",
				owned: true,
			};
			return { port: 60000, secret: "fresh", machineId: "host-1" };
		});
		(
			coordinator as unknown as { startWithPreferredPorts: typeof startMock }
		).startWithPreferredPorts = startMock;
		coordinator.setConfigProvider(async () => spawnConfig);
	});

	afterEach(() => {
		coordinator.stop();
		fs.rmSync(testManifestRoot, { recursive: true, force: true });
		testManifestRoot = "";
	});

	test("restarts a crashed running child with jittered backoff", async () => {
		trackRunning(1111);

		internals.handleChildExit(1111, null, "SIGKILL");

		expect(internals.respawnState?.attempts).toBe(1);
		expect(pendingTimers[0]?.delayMs).toBeGreaterThanOrEqual(500);
		expect(pendingTimers[0]?.delayMs).toBeLessThanOrEqual(1500);
		expect(showAlertMock).not.toHaveBeenCalled();
		await flushTimer();
		expect(startMock).toHaveBeenCalledTimes(1);
	});

	test("does not resurrect a service after stop", async () => {
		let releaseConfig: () => void = () => {};
		coordinator.setConfigProvider(
			() =>
				new Promise((resolve) => {
					releaseConfig = () => resolve(spawnConfig);
				}),
		);
		trackRunning(2222);
		internals.handleChildExit(2222, null, "SIGKILL");

		const timer = pendingTimers.shift();
		if (!timer) throw new Error("no respawn timer was scheduled");
		timer.run();
		coordinator.stop();
		releaseConfig();
		await Promise.resolve();
		await Promise.resolve();

		expect(startMock).not.toHaveBeenCalled();
	});

	test("alerts only after the retry budget is exhausted", () => {
		trackRunning(3333);
		internals.respawnState = {
			attempts: HOST_SERVICE_RESPAWN_MAX_ATTEMPTS,
			timer: null,
			stableTimer: null,
		};

		internals.handleChildExit(3333, null, "SIGKILL");

		expect(showAlertMock).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining("host service for Local"),
			}),
		);
		expect(internals.respawnState).toBeNull();
	});
});

afterAll(() => {
	delete process.env.SUPERSET_TEST_APP_NAME;
	delete process.env.SUPERSET_TEST_APP_VERSION;
	delete process.env.SUPERSET_TEST_APP_PACKAGED;
	mock.restore();
});
