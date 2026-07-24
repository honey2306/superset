import type { MessageKey } from "renderer/providers/I18nProvider";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { ChangesetFile } from "../../../../../useChangeset";

type GroupKey = ChangesetFile["source"]["kind"];

const GROUP_TITLE_KEYS: Record<GroupKey, MessageKey> = {
	unstaged: "v2Workspace.changes.groupUnstaged",
	staged: "v2Workspace.changes.groupStaged",
	"against-base": "v2Workspace.changes.groupAgainstBase",
	commit: "v2Workspace.changes.groupCommit",
};

interface DiffSectionBarProps {
	kind: GroupKey;
	count: number;
}

/**
 * Sticky section bar above the diff scroll area. Shows the source group
 * (unstaged / staged / committed …) of the topmost visible file so the current
 * section stays pinned — like the sidebar's ChangesSection — while you scroll.
 */
export function DiffSectionBar({ kind, count }: DiffSectionBarProps) {
	const { t } = useTranslation();
	return (
		// Announce section changes (e.g. Unstaged → Staged) as they scroll past.
		<div
			aria-live="polite"
			className="flex shrink-0 items-center gap-2 border-border border-b bg-muted/40 px-4 py-1.5"
		>
			<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
				{t(GROUP_TITLE_KEYS[kind])}
			</span>
			<span className="text-[11px] text-muted-foreground/60 tabular-nums">
				{count}
			</span>
		</div>
	);
}
