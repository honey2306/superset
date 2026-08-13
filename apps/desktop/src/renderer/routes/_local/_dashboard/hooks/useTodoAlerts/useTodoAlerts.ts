import { useCallback, useMemo } from "react";
import { useTodoAlertsStore } from "renderer/stores/todo-alerts";
import { type LocalTodo, useLocalTodos } from "../useLocalAutomationData";

const ALERT_STATUSES: LocalTodo["status"][] = [
	"notified",
	"dispatch_failed",
	"skipped_offline",
];

interface TodoAlerts {
	/** Todos surfacing as alerts (notified or failed). */
	alertingIds: Set<string>;
	/** How many of the current user's alerts the user hasn't seen yet. */
	alertCount: number;
	/** Clear the alert badge by acknowledging the user's current alerts. */
	markAlertsSeen: () => void;
}

export function useTodoAlerts(): TodoAlerts {
	const lastSeenAlertAt = useTodoAlertsStore((s) => s.lastSeenAlertAt);
	const markSeen = useTodoAlertsStore((s) => s.markAlertsSeen);

	const { data: rows = [] } = useLocalTodos();

	const { alertingIds, myAlertTimes } = useMemo(() => {
		const alerts = new Set<string>();
		const times: number[] = [];
		for (const t of rows) {
			if (!t) continue;
			if (t.doneAt) continue;
			if (!ALERT_STATUSES.includes(t.status)) continue;
			alerts.add(t.id);
			const at = new Date(t.updatedAt).getTime();
			if (Number.isFinite(at)) times.push(at);
		}
		return { alertingIds: alerts, myAlertTimes: times };
	}, [rows]);

	const alertCount = useMemo(
		() => myAlertTimes.filter((at) => at > lastSeenAlertAt).length,
		[myAlertTimes, lastSeenAlertAt],
	);

	const markAlertsSeen = useCallback(() => {
		const newest = myAlertTimes.reduce((max, at) => Math.max(max, at), 0);
		if (newest > 0) markSeen(newest);
	}, [myAlertTimes, markSeen]);

	return { alertingIds, alertCount, markAlertsSeen };
}
