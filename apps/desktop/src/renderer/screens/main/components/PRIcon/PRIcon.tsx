import { cn } from "@superset/ui/utils";
import {
	LuCircleDot,
	LuGitMerge,
	LuGitPullRequest,
	LuListChecks,
} from "react-icons/lu";

export type PRState = "open" | "merged" | "closed" | "draft" | "queued";

interface PRIconProps {
	state: PRState;
	className?: string;
}

const stateStyles: Record<PRState, string> = {
	open: "text-success",
	merged: "text-violet-500",
	closed: "text-destructive",
	draft: "text-fg-mute",
	queued: "text-amber-500",
};

/**
 * Renders a PR icon with color based on state.
 * - open: green pull request icon
 * - merged: purple/violet merge icon
 * - closed: red dot icon
 * - draft: muted pull request icon
 * - queued: amber queue icon (PR waiting in the merge queue)
 */
export function PRIcon({ state, className }: PRIconProps) {
	const baseClass = cn(stateStyles[state], className);

	if (state === "merged") {
		return <LuGitMerge className={baseClass} />;
	}

	if (state === "closed") {
		return <LuCircleDot className={baseClass} />;
	}

	if (state === "queued") {
		return <LuListChecks className={baseClass} />;
	}

	// open or draft
	return <LuGitPullRequest className={baseClass} />;
}
