export function WorkingIndicator({
	awaitingPermission,
}: {
	awaitingPermission: boolean;
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
				{awaitingPermission ? "Waiting for your approval" : "Working…"}
			</span>
		</output>
	);
}
