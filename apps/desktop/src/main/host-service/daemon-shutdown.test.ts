import { describe, expect, mock, test } from "bun:test";
import { shutdownHostDaemon } from "./daemon-shutdown";

describe("shutdownHostDaemon", () => {
	test("development stops the daemon supervisor", async () => {
		const stop = mock(async () => {});
		const detach = mock(async () => {});

		await shutdownHostDaemon({
			supervisor: { stop, detach },
			organizationId: "org-1",
			isDevelopment: true,
		});

		expect(stop).toHaveBeenCalledWith("org-1");
		expect(detach).not.toHaveBeenCalled();
	});

	test("production awaits detach so pending bootstrap cannot outlive shutdown", async () => {
		const stop = mock(async () => {});
		let finishDetach: () => void = () => {};
		const detach = mock(
			() =>
				new Promise<void>((resolve) => {
					finishDetach = resolve;
				}),
		);

		const shutdown = shutdownHostDaemon({
			supervisor: { stop, detach },
			organizationId: "org-1",
			isDevelopment: false,
		});
		let settled = false;
		void shutdown.then(() => {
			settled = true;
		});
		await Promise.resolve();

		expect(detach).toHaveBeenCalledWith("org-1");
		expect(settled).toBe(false);
		finishDetach();
		await shutdown;
		expect(stop).not.toHaveBeenCalled();
	});
});
