import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { LuCopy, LuEllipsis } from "react-icons/lu";
import { VscHistory } from "react-icons/vsc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { formatRelativeDate } from "../../utils";
import { GitGraphCommitNode } from "./GitGraphCommitNode";

export interface GitHistoryEntry {
	hash: string;
	shortHash: string;
	message: string;
	author: string;
	date: number;
	parents: string[];
	refs: string[];
	branch?: string;
}

interface GitHistoryRowProps {
	commit: GitHistoryEntry;
	selected: boolean;
	compact: boolean;
	currentBranch: string;
	isFirst: boolean;
	isLast: boolean;
	details?: ReactNode;
	onSelect: () => void;
	onCopyHash: () => void;
	onReset: () => void;
}

export interface CommitDiffStats {
	files: number;
	additions: number;
	deletions: number;
}

type RefKind = "branch" | "remote" | "tag";

interface RefBadge {
	label: string;
	kind: RefKind;
	isHead: boolean;
}

function normalizeRef(ref: string, localBranch?: string): RefBadge | null {
	const trimmed = ref.trim();
	if (!trimmed || trimmed === "HEAD") return null;

	const isHead = trimmed.startsWith("HEAD -> ");
	const refName = isHead ? trimmed.slice("HEAD -> ".length).trim() : trimmed;
	if (!refName) return null;

	if (refName.startsWith("tag: ")) {
		return { label: refName.slice("tag: ".length), kind: "tag", isHead };
	}

	const remoteRef = refName.startsWith("refs/remotes/")
		? refName.slice("refs/remotes/".length)
		: refName.startsWith("remotes/")
			? refName.slice("remotes/".length)
			: refName;
	const isExplicitRemote =
		remoteRef !== refName || /^(origin|upstream|fork)\//.test(refName);
	if (isExplicitRemote && remoteRef !== localBranch) {
		return { label: remoteRef, kind: "remote", isHead };
	}

	const localRef = refName.startsWith("refs/heads/")
		? refName.slice("refs/heads/".length)
		: refName;
	return { label: localRef, kind: "branch", isHead };
}

function getRefBadges(
	original: GitHistoryEntry | undefined,
	currentBranch: string,
	includeBranchFallback = false,
): RefBadge[] {
	const badges: RefBadge[] = [];
	const seen = new Set<string>();

	for (const ref of original?.refs ?? []) {
		const badge = normalizeRef(ref, original?.branch);
		if (!badge || seen.has(`${badge.kind}:${badge.label}`)) continue;
		seen.add(`${badge.kind}:${badge.label}`);
		badges.push(badge);
	}

	if (includeBranchFallback && !badges.length && original?.branch) {
		badges.push({
			label: original.branch,
			kind: "branch",
			isHead: original.branch === currentBranch,
		});
	}

	return badges;
}

function refBadgeClassName(badge: RefBadge) {
	if (badge.isHead) {
		return "border-accent-line/70 bg-accent-tint text-accent-solid";
	}
	if (badge.kind === "tag") {
		return "border-warning/30 bg-warning-tint text-warning";
	}
	if (badge.kind === "remote") {
		return "border-line/70 bg-hover/50 text-fg-mute";
	}
	return "border-line/70 bg-surface-elev text-fg-mute";
}

export function RefBadges({
	original,
	currentBranch,
	compact,
	includeBranchFallback = false,
}: {
	original: GitHistoryEntry | undefined;
	currentBranch: string;
	compact: boolean;
	includeBranchFallback?: boolean;
}) {
	const badges = getRefBadges(original, currentBranch, includeBranchFallback);
	if (!badges.length) return null;

	const visibleBadges = badges.slice(0, compact ? 1 : 2);
	const hiddenCount = badges.length - visibleBadges.length;

	return (
		<div className="flex min-w-0 items-center gap-1 overflow-hidden">
			{visibleBadges.map((badge) => (
				<span
					key={`${badge.kind}:${badge.label}`}
					className={cn(
						"inline-flex min-w-0 max-w-[132px] items-center rounded-full border px-1.5 py-px text-[9px] leading-3 transition-colors",
						refBadgeClassName(badge),
					)}
					title={badge.label}
				>
					<span className="truncate">{badge.label}</span>
				</span>
			))}
			{hiddenCount > 0 ? (
				<span
					className="shrink-0 text-[9px] tabular-nums text-fg-faint"
					title={badges
						.slice(visibleBadges.length)
						.map((badge) => badge.label)
						.join(", ")}
				>
					+{hiddenCount}
				</span>
			) : null}
		</div>
	);
}

export function GitHistoryRow({
	commit,
	selected,
	compact,
	currentBranch,
	isFirst,
	isLast,
	details,
	onSelect,
	onCopyHash,
	onReset,
}: GitHistoryRowProps) {
	const { t } = useTranslation();
	const author = commit.author.trim();
	const date = commit.date;

	return (
		<div
			className={cn(
				"group/commit relative w-full min-w-0 border-b border-line/50 text-fg transition-colors",
				selected &&
					"bg-accent-tint/40 shadow-[inset_2px_0_var(--accent-solid)]",
			)}
		>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<button
						type="button"
						onClick={onSelect}
						className={cn(
							"flex min-h-[52px] w-full min-w-0 border-0 bg-transparent px-2 py-2 pr-8 text-left text-inherit transition-colors hover:bg-hover/60",
							selected && "hover:bg-accent-tint/50",
						)}
					>
						<GitGraphCommitNode
							isFirst={isFirst}
							isLast={isLast}
							isMerge={commit.parents.length > 1}
							selected={selected}
						/>
						<div className="min-w-0 flex-1">
							<div
								className="truncate text-xs font-medium leading-4"
								title={commit.message}
							>
								{commit.message}
							</div>
							<div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-[10px] text-fg-faint">
								<span
									className="min-w-0 max-w-28 truncate text-fg-mute"
									title={author || t("changes.log.author")}
								>
									{author || t("changes.log.author")}
								</span>
								<span aria-hidden="true">·</span>
								<span className="shrink-0">
									{formatRelativeDate(new Date(date), t)}
								</span>
								<RefBadges
									original={commit}
									currentBranch={currentBranch}
									compact={compact}
								/>
							</div>
						</div>
					</button>
				</ContextMenuTrigger>
				<ContextMenuContent className="w-56">
					<ContextMenuItem onClick={onCopyHash}>
						<LuCopy className="size-3.5" />
						{t("changes.log.copyHash")}
					</ContextMenuItem>
					<ContextMenuItem variant="destructive" onClick={onReset}>
						<VscHistory className="size-4" />
						{t("changes.log.resetHere")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<button
						type="button"
						className="absolute right-1.5 top-2 flex size-6 items-center justify-center rounded-ds-3 text-fg-faint opacity-0 transition-opacity hover:bg-hover hover:text-fg group-hover/commit:opacity-100 focus:opacity-100 data-[state=open]:opacity-100"
						aria-label={t("changes.log.commitActions")}
					>
						<LuEllipsis className="size-3.5" />
					</button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-56">
					<DropdownMenuItem onClick={onCopyHash}>
						<LuCopy className="size-3.5" />
						{t("changes.log.copyHash")}
					</DropdownMenuItem>
					<DropdownMenuItem variant="destructive" onClick={onReset}>
						<VscHistory className="size-4" />
						{t("changes.log.resetHere")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			{details ? <div className="ml-8 mr-2 pb-2">{details}</div> : null}
		</div>
	);
}
