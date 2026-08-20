interface WorkspaceAheadBehindProps {
	pullCount: number;
	pushCount: number;
	hasUpstream: boolean;
}

export function WorkspaceAheadBehind({
	pullCount,
	pushCount,
	hasUpstream,
}: WorkspaceAheadBehindProps) {
	if (!hasUpstream || (pullCount === 0 && pushCount === 0)) {
		return null;
	}

	return (
		<div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums shrink-0">
			{pullCount > 0 && <span className="text-warning">↓{pullCount}</span>}
			{pushCount > 0 && <span className="text-success">↑{pushCount}</span>}
		</div>
	);
}
