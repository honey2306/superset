import { useCallback, useEffect, useRef, useState } from "react";

export const ACP_ACTIVITY_CONNECTION_RETENTION_MS = 24 * 60 * 60 * 1_000;

export function useRetainedAcpConnection({
	isWorkspaceActive,
	retentionMs = ACP_ACTIVITY_CONNECTION_RETENTION_MS,
}: {
	isWorkspaceActive: boolean;
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

	// A pane that has been opened is an active conversation even before its
	// first prompt. Keep its live ACP subscription while its workspace is
	// visited so switching back does not tear down and resync the session.
	useEffect(() => {
		if (isWorkspaceActive) recordActivity();
	}, [isWorkspaceActive, recordActivity]);

	useEffect(() => clearRetentionTimeout, [clearRetentionTimeout]);

	return {
		isConnectionEnabled: isWorkspaceActive || isActivityRetained,
		recordActivity,
	};
}
