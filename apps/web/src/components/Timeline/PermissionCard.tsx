import type { PendingPermission } from "@superset/session-protocol";

interface Props {
	pending: PendingPermission;
	onAllowOnce: () => void;
	onRejectOnce: () => void;
}

export function PermissionCard({ pending, onAllowOnce, onRejectOnce }: Props) {
	const tool = pending.toolCall.title ?? pending.toolCall.kind ?? "tool";
	return (
		<div className="mt-2 rounded-2xl bg-yellow-500/10 p-3 text-sm ring-1 ring-yellow-500/30">
			<div className="mb-2 text-yellow-200">
				Permission requested: <span className="font-mono">{tool}</span>
			</div>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={onAllowOnce}
					className="flex-1 rounded-lg bg-yellow-400 px-3 py-2 text-sm font-medium text-black"
				>
					Allow once
				</button>
				<button
					type="button"
					onClick={onRejectOnce}
					className="flex-1 rounded-lg bg-black/30 px-3 py-2 text-sm text-white ring-1 ring-white/10"
				>
					Reject
				</button>
			</div>
		</div>
	);
}
