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

export function WorkingIndicator({
	awaitingPermission,
	awaitingResponse,
}: {
	awaitingPermission: boolean;
	awaitingResponse: boolean;
}) {
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
		</output>
	);
}
