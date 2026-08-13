interface AcpSessionErrorProps {
	message: string;
	hint?: string;
	onRetry?(): void;
}

export function AcpSessionError({
	message,
	hint,
	onRetry,
}: AcpSessionErrorProps) {
	return (
		<div className="acp-pane__empty">
			<div
				className="acp-pane__empty-title select-text cursor-text"
				style={{ color: "var(--acp-red)" }}
			>
				{message}
			</div>
			{hint && (
				<div
					className="select-text cursor-text"
					style={{ maxWidth: 480, margin: "6px auto" }}
				>
					{hint}
				</div>
			)}
			{onRetry && (
				<button
					type="button"
					className="acp-pane__empty-action"
					style={{ marginTop: 12 }}
					onClick={onRetry}
				>
					Retry
				</button>
			)}
		</div>
	);
}
