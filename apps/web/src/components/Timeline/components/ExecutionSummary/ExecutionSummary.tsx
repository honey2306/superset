interface ExecutionSummaryProps {
	toolCallCount: number;
	messageCount: number;
	duration: string | null;
	expanded: boolean;
	onToggle(): void;
}

export function ExecutionSummary({
	toolCallCount,
	messageCount,
	duration,
	expanded,
	onToggle,
}: ExecutionSummaryProps) {
	return (
		<button
			type="button"
			className="mobile-caption-text flex w-full items-center gap-2 py-1.5 text-left text-xs"
			aria-expanded={expanded}
			onClick={onToggle}
		>
			<span
				className={`transition-transform ${expanded ? "rotate-90" : ""}`}
				aria-hidden="true"
			>
				›
			</span>
			<span>
				Execution:{" "}
				{[
					toolCallCount > 0
						? `${toolCallCount} tool ${toolCallCount === 1 ? "call" : "calls"}`
						: null,
					messageCount > 0
						? `${messageCount} ${messageCount === 1 ? "message" : "messages"}`
						: null,
				]
					.filter(Boolean)
					.join(" · ")}
			</span>
			{duration ? (
				<span className="ml-auto text-white/35">Time {duration}</span>
			) : null}
		</button>
	);
}
