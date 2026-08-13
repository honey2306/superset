export interface QuotaGuardStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface QuotaGuardHandlers {
	reclaim: () => number;
	onPersistFailed: (storageKey: string, error: unknown) => void;
	storage?: QuotaGuardStorage;
}

function isQuotaExceeded(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const legacyCode = (error as DOMException).code;
	return (
		error.name === "QuotaExceededError" ||
		error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
		legacyCode === 22 ||
		legacyCode === 1014
	);
}

export function withQuotaGuard<T>(options: T, handlers: QuotaGuardHandlers): T {
	const base =
		handlers.storage ??
		(options as { storage?: QuotaGuardStorage }).storage ??
		window.localStorage;
	const storage: QuotaGuardStorage = {
		getItem: (key) => base.getItem(key),
		removeItem: (key) => base.removeItem(key),
		setItem: (key, value) => {
			try {
				base.setItem(key, value);
				return;
			} catch (error) {
				if (!isQuotaExceeded(error)) throw error;
				if (handlers.reclaim() === 0) {
					handlers.onPersistFailed(key, error);
					// A notification is not durability. Propagate quota exhaustion so
					// callers cannot acknowledge a migration whose write never landed.
					throw error;
				}
			}
			try {
				base.setItem(key, value);
			} catch (error) {
				if (!isQuotaExceeded(error)) throw error;
				handlers.onPersistFailed(key, error);
				throw error;
			}
		},
	};
	return { ...options, storage } as T;
}
