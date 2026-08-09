import type { SelectTodo } from "@superset/db/schema";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useTodoAlertsStore } from "renderer/stores/todo-alerts";

const ALERT_STATUSES: SelectTodo["status"][] = [
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
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;
	const lastSeenAlertAt = useTodoAlertsStore((s) => s.lastSeenAlertAt);
	const markSeen = useTodoAlertsStore((s) => s.markAlertsSeen);

	const { data: rows = [] } = useLiveQuery(
		(q) =>
			q.from({ t: collections.todos }).select(({ t }) => ({
				id: t.id,
				ownerUserId: t.ownerUserId,
				status: t.status,
				updatedAt: t.updatedAt,
				doneAt: t.doneAt,
			})),
		[collections.todos],
	);

	const { alertingIds, myAlertTimes } = useMemo(() => {
		const alerts = new Set<string>();
		const times: number[] = [];
		for (const t of rows) {
			if (!t) continue;
			if (t.doneAt) continue;
			if (!ALERT_STATUSES.includes(t.status)) continue;
			alerts.add(t.id);
			if (t.ownerUserId === currentUserId) {
				const at = new Date(t.updatedAt as unknown as string).getTime();
				if (Number.isFinite(at)) times.push(at);
			}
		}
		return { alertingIds: alerts, myAlertTimes: times };
	}, [rows, currentUserId]);

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
