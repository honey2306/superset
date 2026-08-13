import {
	getPanesRepositoryVersion,
	getPanesStore,
	type PanesStore,
	subscribePanesRepository,
} from "./repository";
import type { PaneNavigationResult } from "./types";

const MAX_QUEUED_INTENTS = 100;
const DEFAULT_INTENT_TTL_MS = 30_000;

interface QueuedIntent<T> {
	id: string;
	workspaceId: string;
	dedupeKey: string;
	expiresAt: number;
	apply: (store: PanesStore) => T;
}

const queuedIntents: QueuedIntent<unknown>[] = [];

function pruneExpired(now = Date.now()): void {
	for (let index = queuedIntents.length - 1; index >= 0; index -= 1) {
		if (queuedIntents[index].expiresAt <= now) queuedIntents.splice(index, 1);
	}
}

function drainWorkspace(workspaceId: string): void {
	const store = getPanesStore(workspaceId);
	if (!store) return;
	const now = Date.now();
	for (let index = 0; index < queuedIntents.length; ) {
		const intent = queuedIntents[index];
		if (intent.workspaceId !== workspaceId) {
			index += 1;
			continue;
		}
		queuedIntents.splice(index, 1);
		if (intent.expiresAt > now) intent.apply(store);
	}
}

let observedRepositoryVersion = getPanesRepositoryVersion();
subscribePanesRepository(() => {
	const nextVersion = getPanesRepositoryVersion();
	if (nextVersion === observedRepositoryVersion) return;
	observedRepositoryVersion = nextVersion;
	for (const intent of [...queuedIntents]) drainWorkspace(intent.workspaceId);
});

export function navigatePanes<T>(options: {
	workspaceId: string;
	dedupeKey: string;
	apply: (store: PanesStore) => T;
	ttlMs?: number;
}): PaneNavigationResult<T> {
	const store = getPanesStore(options.workspaceId);
	if (store) return { status: "applied", value: options.apply(store) };

	const now = Date.now();
	pruneExpired(now);
	const existing = queuedIntents.find(
		(intent) =>
			intent.workspaceId === options.workspaceId &&
			intent.dedupeKey === options.dedupeKey,
	);
	if (existing) {
		return { status: "queued", intentId: existing.id, deduplicated: true };
	}
	if (queuedIntents.length >= MAX_QUEUED_INTENTS) {
		return { status: "rejected", reason: "queue-full" };
	}
	const id = crypto.randomUUID();
	queuedIntents.push({
		id,
		workspaceId: options.workspaceId,
		dedupeKey: options.dedupeKey,
		expiresAt: now + (options.ttlMs ?? DEFAULT_INTENT_TTL_MS),
		apply: options.apply as (store: PanesStore) => unknown,
	});
	return { status: "queued", intentId: id, deduplicated: false };
}

export function clearQueuedPaneIntentsForTests(): void {
	queuedIntents.length = 0;
}

export function getQueuedPaneIntentCountForTests(): number {
	pruneExpired();
	return queuedIntents.length;
}
