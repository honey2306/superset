import { describe, expect, it, mock } from "bun:test";
import {
	createPowerSaveBlockerManager,
	hasRunningWork,
} from "./power-save-blocker";

describe("hasRunningWork", () => {
	it("counts ACP and terminal agents independently of mounted panes", () => {
		expect(hasRunningWork(["idle", "running"], [])).toBe(true);
		expect(hasRunningWork(["awaiting_permission"], [])).toBe(true);
		expect(hasRunningWork(["offline"], ["Start"])).toBe(true);
		expect(hasRunningWork(["idle"], ["PermissionRequest"])).toBe(true);
		expect(hasRunningWork(["idle", "dead"], ["Stop", "Failed"])).toBe(false);
	});
});

describe("createPowerSaveBlockerManager", () => {
	it("keeps one blocker active until no work is running", () => {
		const start = mock(() => 7);
		const stop = mock<(id: number) => void>();
		const manager = createPowerSaveBlockerManager({ start, stop });

		manager.setActive(true);
		manager.setActive(true);
		expect(start).toHaveBeenCalledTimes(1);
		expect(manager.isActive()).toBe(true);

		manager.setActive(false);
		manager.setActive(false);
		expect(stop).toHaveBeenCalledTimes(1);
		expect(stop).toHaveBeenCalledWith(7);
		expect(manager.isActive()).toBe(false);
	});

	it("releases the blocker during shutdown", () => {
		const stop = mock<(id: number) => void>();
		const manager = createPowerSaveBlockerManager({
			start: () => 3,
			stop,
		});

		manager.setActive(true);
		manager.stop();
		manager.stop();
		expect(stop).toHaveBeenCalledTimes(1);
	});
});
