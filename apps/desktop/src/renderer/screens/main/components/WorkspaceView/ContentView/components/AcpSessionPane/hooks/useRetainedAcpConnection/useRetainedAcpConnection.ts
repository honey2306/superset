import { useCallback, useEffect, useRef, useState } from "react";

export const ACP_ACTIVITY_CONNECTION_RETENTION_MS = 24 * 60 * 60 * 1_000;

export function useRetainedAcpConnection({
	retentionMs = ACP_ACTIVITY_CONNECTION_RETENTION_MS,
}: {
	retentionMs?: number;
}): {
	isConnectionEnabled: boolean;
	recordActivity: () => void;
} {
	const [isActivityRetained, setIsActivityRetained] = useState(false);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearRetentionTimeout = useCallback(() => {
		if (timeoutRef.current === null) return;
		clearTimeout(timeoutRef.current);
		timeoutRef.current = null;
	}, []);

	const recordActivity = useCallback(() => {
		clearRetentionTimeout();
		setIsActivityRetained(true);
		timeoutRef.current = setTimeout(() => {
			timeoutRef.current = null;
			setIsActivityRetained(false);
		}, retentionMs);
	}, [clearRetentionTimeout, retentionMs]);

	useEffect(() => clearRetentionTimeout, [clearRetentionTimeout]);

	return {
		// Workspace activation alone must not revive every mounted historical
		// session. Visible panes are enabled by the caller; hidden panes stay live
		// only for the explicit activity retention window.
		isConnectionEnabled: isActivityRetained,
		recordActivity,
	};
}
