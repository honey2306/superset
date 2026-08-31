import { useEffect, useState } from "react";
import { formatElapsedDuration } from "./utils/timelineTurns";

export function getWorkingIndicatorLabel({
	awaitingPermission,
	awaitingResponse,
}: {
	awaitingPermission: boolean;
	awaitingResponse: boolean;
}): string {
	if (!awaitingPermission) return "Working…";
	return awaitingResponse
		? "Waiting for your response"
		: "Waiting for your approval";
}

export function getWorkingIndicatorDuration({
	startedAt,
	now,
}: {
	startedAt: number | null;
	now: number;
}): string | null {
	if (startedAt === null || !Number.isFinite(startedAt)) return null;
	return formatElapsedDuration(Math.max(0, now - startedAt));
}

export function WorkingIndicator({
	awaitingPermission,
	awaitingResponse,
	startedAt,
}: {
	awaitingPermission: boolean;
	awaitingResponse: boolean;
	startedAt: number | null;
}) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		setNow(Date.now());
		const timer = window.setInterval(() => setNow(Date.now()), 1_000);
		return () => window.clearInterval(timer);
	}, []);
	const duration = getWorkingIndicatorDuration({ startedAt, now });

	return (
		<output
			className="mb-2 flex items-center gap-2 px-3 py-2 text-sm text-white/75"
			aria-live="polite"
		>
			<span
				className="size-2 animate-pulse rounded-full bg-emerald-400"
				aria-hidden="true"
			/>
			<span>
				{getWorkingIndicatorLabel({ awaitingPermission, awaitingResponse })}
			</span>
			{duration ? <span className="text-white/40">{duration}</span> : null}
		</output>
	);
}
