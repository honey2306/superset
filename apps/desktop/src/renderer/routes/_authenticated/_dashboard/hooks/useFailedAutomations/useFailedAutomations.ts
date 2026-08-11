import { useCallback, useMemo } from "react";
import { useAutomationFailuresStore } from "renderer/stores/automation-failures";
import {
	type LocalAutomationRun,
	useLocalAutomations,
} from "../useLocalAutomationData";

const FAILED_STATUSES: LocalAutomationRun["status"][] = [
	"skipped_offline",
	"dispatch_failed",
];

interface FailedAutomations {
	/** Most recent run status per automation (absent = no runs yet). */
	lastRunStatusById: Map<string, LocalAutomationRun["status"]>;
	/** Automations whose most recent run failed. */
	failedIds: Set<string>;
	/** How many of the current user's failures the user hasn't seen yet. */
	myFailedCount: number;
	/** Clear the failure badge by acknowledging the user's current failures. */
	markMyFailuresSeen: () => void;
}

export function useFailedAutomations(): FailedAutomations {
	const lastSeenFailureAt = useAutomationFailuresStore(
		(s) => s.lastSeenFailureAt,
	);
	const markFailuresSeen = useAutomationFailuresStore(
		(s) => s.markFailuresSeen,
	);

	const { data: automationRows = [] } = useLocalAutomations();

	const { lastRunStatusById, failedIds, myFailureTimes } = useMemo(() => {
		const lastRunStatusById = new Map<string, LocalAutomationRun["status"]>();
		const failedIds = new Set<string>();
		const myFailureTimes: number[] = [];
		for (const automation of automationRows) {
			const run = automation.lastRun;
			if (!run) continue;
			lastRunStatusById.set(automation.id, run.status);
			if (!FAILED_STATUSES.includes(run.status)) continue;
			failedIds.add(automation.id);
			const at = new Date(run.createdAt).getTime();
			if (Number.isFinite(at)) myFailureTimes.push(at);
		}
		return { lastRunStatusById, failedIds, myFailureTimes };
	}, [automationRows]);

	const myFailedCount = useMemo(
		() => myFailureTimes.filter((at) => at > lastSeenFailureAt).length,
		[myFailureTimes, lastSeenFailureAt],
	);

	const markMyFailuresSeen = useCallback(() => {
		const newest = myFailureTimes.reduce((max, at) => Math.max(max, at), 0);
		if (newest > 0) markFailuresSeen(newest);
	}, [myFailureTimes, markFailuresSeen]);

	return { lastRunStatusById, failedIds, myFailedCount, markMyFailuresSeen };
}
