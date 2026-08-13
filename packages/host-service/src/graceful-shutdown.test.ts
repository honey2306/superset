import { describe, expect, mock, test } from "bun:test";
import { installHostServiceShutdown } from "./graceful-shutdown";

describe("installHostServiceShutdown", () => {
	test("orders shutdown and coalesces repeated signals", async () => {
		const calls: string[] = [];
		const exit = mock((_code: number) => {
			calls.push("exit");
		});
		const server = {
			close(callback: () => void) {
				calls.push("server.close");
				callback();
				return this;
			},
			closeAllConnections() {
				calls.push("server.closeAllConnections");
			},
		};
		const installed = installHostServiceShutdown({
			server,
			stopRelay: () => {
				calls.push("relay.stop");
			},
			stopDevDaemon: async () => {
				calls.push("daemon.stop");
			},
			disposeApp: async () => {
				calls.push("app.dispose");
			},
			exit,
		});

		try {
			const first = installed.shutdown("SIGTERM");
			const second = installed.shutdown("SIGINT");
			expect(second).toBe(first);
			await first;
		} finally {
			installed.removeSignalHandlers();
		}

		expect(calls).toEqual([
			"server.close",
			"relay.stop",
			"app.dispose",
			"daemon.stop",
			"server.closeAllConnections",
			"exit",
		]);
		expect(exit).toHaveBeenCalledTimes(1);
	});

	test("waits for server drain before disposing the app", async () => {
		const calls: string[] = [];
		let finishDrain: () => void = () => {};
		const installed = installHostServiceShutdown({
			server: {
				close(callback: () => void) {
					calls.push("server.close");
					finishDrain = callback;
				},
			},
			stopRelay: () => {
				calls.push("relay.stop");
			},
			disposeApp: async () => {
				calls.push("app.dispose");
			},
			exit: () => calls.push("exit"),
		});

		try {
			const shutdown = installed.shutdown("SIGTERM");
			await Promise.resolve();
			expect(calls).toEqual(["server.close", "relay.stop"]);
			finishDrain();
			await shutdown;
		} finally {
			installed.removeSignalHandlers();
		}

		expect(calls).toEqual([
			"server.close",
			"relay.stop",
			"app.dispose",
			"exit",
		]);
	});

	test("isolates cleanup failures so later phases still run", async () => {
		const calls: string[] = [];
		const installed = installHostServiceShutdown({
			server: {
				close(callback: () => void) {
					calls.push("server.close");
					callback();
				},
				closeAllConnections: () => calls.push("server.closeAllConnections"),
			},
			stopRelay: () => {
				calls.push("relay.stop");
				throw new Error("relay failure");
			},
			disposeApp: async () => {
				calls.push("app.dispose");
				throw new Error("dispose failure");
			},
			stopDevDaemon: async () => {
				calls.push("daemon.stop");
			},
			exit: () => calls.push("exit"),
		});

		try {
			await installed.shutdown("SIGTERM");
		} finally {
			installed.removeSignalHandlers();
		}

		expect(calls).toEqual([
			"server.close",
			"relay.stop",
			"app.dispose",
			"daemon.stop",
			"server.closeAllConnections",
			"exit",
		]);
	});

	test("force-finalizes when server drain exceeds the shutdown deadline", async () => {
		const exit = mock((_code: number) => {});
		const closeAllConnections = mock(() => {});
		const installed = installHostServiceShutdown({
			server: {
				close() {},
				closeAllConnections,
			},
			disposeApp: async () => {},
			exit,
			forceTimeoutMs: 10,
		});

		try {
			void installed.shutdown("SIGTERM");
			await new Promise((resolve) => setTimeout(resolve, 30));
		} finally {
			installed.removeSignalHandlers();
		}

		expect(closeAllConnections).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledTimes(1);
		expect(exit).toHaveBeenCalledWith(0);
	});
});
