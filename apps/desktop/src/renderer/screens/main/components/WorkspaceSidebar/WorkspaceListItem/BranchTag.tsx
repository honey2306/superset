import { cn } from "@superset/ui/utils";
import { LuGitBranch } from "react-icons/lu";
import { STROKE_WIDTH } from "../constants";
import { formatBranchTag } from "./formatBranchTag";

interface BranchTagProps {
	branch: string;
	className?: string;
}

export function BranchTag({ branch, className }: BranchTagProps) {
	const { label, color } = formatBranchTag(branch);
	if (!label) return null;

	return (
		<span
			title={branch}
			className={cn(
				"inline-flex w-fit max-w-full items-center gap-1 rounded-ds-2 px-1.5 py-px",
				"font-mono text-[10px] leading-[1.45] tracking-[var(--ls-mono)]",
				className,
			)}
			style={{
				backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`,
				color,
			}}
		>
			<LuGitBranch
				className="size-[9px] shrink-0 opacity-60"
				strokeWidth={STROKE_WIDTH}
			/>
			<span className="truncate">{label}</span>
		</span>
	);
}
