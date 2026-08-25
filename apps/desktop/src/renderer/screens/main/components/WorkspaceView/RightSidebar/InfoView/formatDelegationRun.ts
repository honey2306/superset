const ACTIVE_DELEGATION_RUN_STATUSES = new Set(["creating", "running"]);

export type DelegationRunTiming = {
	status: string;
	createdAt: number;
	startedAt: number | null;
	updatedAt: number;
};

/**
 * Formats a delegation's wall-clock duration without letting terminal runs
 * continue growing after their final database update. `updatedAt` is the
 * durable terminal timestamp for cancelled/interrupted runs, which do not
 * have a completedAt or failedAt value.
 */
export function formatDelegationRunElapsed(
	run: DelegationRunTiming,
	now: number,
): string {
	const start = run.startedAt ?? run.createdAt;
	const end = ACTIVE_DELEGATION_RUN_STATUSES.has(run.status)
		? now
		: run.updatedAt;
	const seconds = Math.max(0, Math.floor((end - start) / 1_000));
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}
