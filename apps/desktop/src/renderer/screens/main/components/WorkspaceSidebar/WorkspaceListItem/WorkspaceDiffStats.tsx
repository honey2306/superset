import { cn } from "@superset/ui/utils";

interface WorkspaceDiffStatsProps {
	additions: number;
	deletions: number;
	isActive?: boolean;
}

export function WorkspaceDiffStats({
	additions,
	deletions,
	isActive,
}: WorkspaceDiffStatsProps) {
	return (
		<div
			className={cn(
				"flex h-5 shrink-0 items-center rounded px-1.5 font-mono text-[10px] tabular-nums group-hover:hidden",
				isActive ? "bg-foreground/10" : "bg-hover/50",
			)}
		>
			<div className="flex items-center gap-1.5 leading-none">
				<span className="text-success">+{additions}</span>
				<span className="text-destructive">−{deletions}</span>
			</div>
		</div>
	);
}
