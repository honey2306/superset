import type { ToolCallItem } from "@superset/session-protocol";

interface Props {
	item: ToolCallItem;
}

export function ToolCallRow({ item }: Props) {
	const { status, title } = item.call;
	const statusColor =
		status === "completed"
			? "text-green-300"
			: status === "failed"
				? "text-red-300"
				: "text-white/60";
	return (
		<div className="mobile-timeline-card rounded-lg p-2 text-xs">
			<div className="flex items-center justify-between">
				<span className="font-mono">{title}</span>
				<span className={statusColor}>{status}</span>
			</div>
		</div>
	);
}
