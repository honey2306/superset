// Foreground-only polling keeps revoke/expiry feedback prompt without waking
// a background phone tab every few seconds.
export const WORKSPACE_CATALOG_REFRESH_INTERVAL_MS = 10_000;

export type WorkspaceCatalogRefreshScheduler = {
	setInterval: (callback: () => void, intervalMs: number) => unknown;
	clearInterval: (timer: unknown) => void;
	addForegroundListener: (listener: () => void) => () => void;
	isForeground: () => boolean;
};

const browserScheduler: WorkspaceCatalogRefreshScheduler = {
	setInterval: (callback, intervalMs) =>
		window.setInterval(callback, intervalMs),
	clearInterval: (timer) => window.clearInterval(timer as number),
	addForegroundListener: (listener) => {
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") listener();
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		window.addEventListener("focus", listener);
		return () => {
			document.removeEventListener("visibilitychange", onVisibilityChange);
			window.removeEventListener("focus", listener);
		};
	},
	isForeground: () => document.visibilityState === "visible",
};

type WorkspaceCatalogRefresherOptions<TSnapshot> = {
	intervalMs?: number;
	onSnapshot: (snapshot: TSnapshot) => void;
	onError: (error: unknown) => void;
	scheduler?: WorkspaceCatalogRefreshScheduler;
};

export function createWorkspaceCatalogRefresher<TSnapshot>(
	fetchSnapshot: () => Promise<TSnapshot>,
	{
		intervalMs = WORKSPACE_CATALOG_REFRESH_INTERVAL_MS,
		onSnapshot,
		onError,
		scheduler = browserScheduler,
	}: WorkspaceCatalogRefresherOptions<TSnapshot>,
): {
	start: () => void;
	stop: () => void;
	refresh: () => Promise<void>;
} {
	let started = false;
	let timer: unknown;
	let removeForegroundListener: (() => void) | null = null;
	let inFlight: Promise<void> | null = null;

	const refresh = (): Promise<void> => {
		if (!started || inFlight) return inFlight ?? Promise.resolve();

		const pending = fetchSnapshot()
			.then((snapshot) => {
				if (started) onSnapshot(snapshot);
			})
			.catch((error: unknown) => {
				if (started) onError(error);
			})
			.finally(() => {
				if (inFlight === pending) inFlight = null;
			});
		inFlight = pending;
		return pending;
	};

	const refreshIfForeground = () => {
		if (scheduler.isForeground()) void refresh();
	};

	const start = () => {
		if (started) return;
		started = true;
		timer = scheduler.setInterval(refreshIfForeground, intervalMs);
		removeForegroundListener =
			scheduler.addForegroundListener(refreshIfForeground);
	};

	const stop = () => {
		if (!started) return;
		started = false;
		if (timer !== undefined) scheduler.clearInterval(timer);
		timer = undefined;
		removeForegroundListener?.();
		removeForegroundListener = null;
	};

	return { start, stop, refresh };
}
