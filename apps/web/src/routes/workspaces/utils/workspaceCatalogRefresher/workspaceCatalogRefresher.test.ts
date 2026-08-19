import { expect, test } from "bun:test";
import {
	createWorkspaceCatalogRefresher,
	type WorkspaceCatalogRefreshScheduler,
} from "./workspaceCatalogRefresher";

type CatalogSnapshot = {
	projects: string[];
};

function createTestScheduler(): {
	scheduler: WorkspaceCatalogRefreshScheduler;
	fireInterval: () => void;
	setForeground: (foreground: boolean) => void;
	fireForeground: () => void;
} {
	let nextTimerId = 0;
	let foreground = true;
	const intervalCallbacks = new Map<number, () => void>();
	const foregroundListeners = new Set<() => void>();

	return {
		scheduler: {
			setInterval: (callback) => {
				const timerId = nextTimerId++;
				intervalCallbacks.set(timerId, callback);
				return timerId;
			},
			clearInterval: (timer) => {
				if (typeof timer === "number") intervalCallbacks.delete(timer);
			},
			addForegroundListener: (listener) => {
				foregroundListeners.add(listener);
				return () => foregroundListeners.delete(listener);
			},
			isForeground: () => foreground,
		},
		fireInterval: () => {
			for (const callback of intervalCallbacks.values()) callback();
		},
		setForeground: (nextForeground) => {
			foreground = nextForeground;
		},
		fireForeground: () => {
			for (const listener of foregroundListeners) listener();
		},
	};
}

test("refreshes changed catalog data and coalesces overlapping requests", async () => {
	const testScheduler = createTestScheduler();
	const snapshots: CatalogSnapshot[] = [
		{ projects: ["initial-project"] },
		{ projects: ["initial-project", "new-project"] },
	];
	const pendingResolves: Array<(snapshot: CatalogSnapshot) => void> = [];
	let fetchCount = 0;
	const appliedProjects: string[][] = [];
	const refresher = createWorkspaceCatalogRefresher<CatalogSnapshot>(
		async () => {
			fetchCount += 1;
			return new Promise((resolve) => pendingResolves.push(resolve));
		},
		{
			intervalMs: 30_000,
			onSnapshot: (snapshot) => appliedProjects.push(snapshot.projects),
			onError: () => {},
			scheduler: testScheduler.scheduler,
		},
	);

	refresher.start();
	const firstRefresh = refresher.refresh();
	const overlappingRefresh = refresher.refresh();
	expect(overlappingRefresh).toBe(firstRefresh);
	expect(fetchCount).toBe(1);

	pendingResolves.shift()?.(snapshots[0] as CatalogSnapshot);
	await firstRefresh;
	expect(appliedProjects).toEqual([["initial-project"]]);

	testScheduler.fireInterval();
	expect(fetchCount).toBe(2);
	pendingResolves.shift()?.(snapshots[1] as CatalogSnapshot);
	await refresher.refresh();
	expect(appliedProjects).toEqual([
		["initial-project"],
		["initial-project", "new-project"],
	]);

	testScheduler.setForeground(false);
	testScheduler.fireInterval();
	expect(fetchCount).toBe(2);
	testScheduler.setForeground(true);
	testScheduler.fireForeground();
	expect(fetchCount).toBe(3);

	refresher.stop();
	testScheduler.fireInterval();
	testScheduler.fireForeground();
	expect(fetchCount).toBe(3);
});
