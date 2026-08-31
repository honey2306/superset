import { cn } from "@superset/ui/utils";

interface GitGraphCommitNodeProps {
	isFirst: boolean;
	isLast: boolean;
	isMerge: boolean;
	selected: boolean;
}

export function GitGraphCommitNode({
	isFirst,
	isLast,
	isMerge,
	selected,
}: GitGraphCommitNodeProps) {
	return (
		<div
			className="relative min-h-9 w-6 shrink-0 self-stretch"
			aria-hidden="true"
		>
			{!isFirst ? (
				<span className="absolute -top-2 left-[9px] h-[15px] w-px bg-line/70" />
			) : null}
			{!isLast ? (
				<span className="absolute -bottom-2 left-[9px] top-[7px] w-px bg-line/70" />
			) : null}
			{isMerge ? (
				<span className="absolute left-[12px] top-[7px] h-7 w-2 rounded-bl-md border-b border-l border-[color:color-mix(in_oklch,var(--accent-2)_55%,var(--line))]" />
			) : null}
			<span
				className={cn(
					"absolute left-[5px] top-1.5 z-10 size-[9px] rounded-full border-2 bg-background transition-colors",
					isMerge ? "border-[color:var(--accent-2)]" : "border-accent-solid",
					selected && "border-accent-solid bg-accent-solid",
				)}
			/>
		</div>
	);
}
