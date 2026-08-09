import type { ToolCallItem } from "@superset/session-protocol";

interface Props {
	item: ToolCallItem;
}

export function ToolCallRow({ item }: Props) {
	const status = item.call.status ?? "pending";
	const name = item.call.title ?? item.call.kind ?? "tool";
	const statusColor =
		status === "completed"
			? "text-green-300"
			: status === "failed"
				? "text-red-300"
				: "text-white/60";
	return (
		<div className="rounded-lg bg-white/5 p-2 text-xs ring-1 ring-white/10">
			<div className="flex items-center justify-between">
				<span className="font-mono">{name}</span>
				<span className={statusColor}>{status}</span>
			</div>
		</div>
	);
}
