import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { cn } from "@superset/ui/utils";
import { VscHistory } from "react-icons/vsc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { formatRelativeDate } from "../../utils";

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
	stats?: CommitDiffStats;
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

function DiffStats({ stats }: { stats?: CommitDiffStats }) {
	const { t } = useTranslation();
	if (!stats) return null;
	return (
		<span className="inline-flex shrink-0 items-center gap-1 text-[9px] tabular-nums">
			<span className="text-success">+{stats.additions}</span>
			<span className="text-danger">-{stats.deletions}</span>
			<span className="text-fg-faint">
				{t("changes.log.fileCount", { count: stats.files })}
			</span>
		</span>
	);
}

export function GitHistoryRow({
	commit,
	selected,
	compact,
	currentBranch,
	stats,
	onSelect,
	onCopyHash,
	onReset,
}: GitHistoryRowProps) {
	const { t } = useTranslation();
	const author = commit.author.trim();
	const date = commit.date;
	const shortHash = commit.shortHash;

	return (
		<div
			className={cn(
				"group/commit w-full min-w-0 border-b border-line/50 text-fg transition-colors",
				selected && "border-l-2 border-l-accent-solid text-fg",
			)}
		>
			<ContextMenu>
				<ContextMenuTrigger asChild>
					<button
						type="button"
						onClick={onSelect}
						className={cn(
							"flex min-h-[47px] w-full min-w-0 items-center border-0 bg-transparent px-2 py-1 text-left text-inherit transition-colors hover:bg-hover/60",
							selected && "bg-hover/70 hover:bg-hover",
						)}
					>
						<div className="min-w-0 flex-1">
							<div className="flex min-w-0 items-center gap-1.5">
								<div
									className="min-w-0 flex-1 truncate text-xs font-medium leading-4"
									title={commit.message}
								>
									{commit.message}
								</div>
								{!compact ? (
									<span className="shrink-0 text-[10px] text-fg-mute">
										{formatRelativeDate(new Date(date), t)}
									</span>
								) : null}
							</div>
							<div className="mt-0.5 flex min-w-0 items-center gap-1.5 overflow-hidden">
								<div
									className="inline-flex min-w-0 max-w-[116px] shrink items-center rounded-full border border-[color:color-mix(in_oklch,var(--accent-2)_30%,transparent)] bg-[color:color-mix(in_oklch,var(--accent-2)_10%,transparent)] px-1.5 py-px text-[9px] font-medium leading-3 text-[color:var(--accent-2)]"
									title={author || t("changes.log.author")}
								>
									<span className="min-w-0 truncate">
										{author || t("changes.log.author")}
									</span>
								</div>
								<RefBadges
									original={commit}
									currentBranch={currentBranch}
									compact={compact}
								/>
								{stats ? <DiffStats stats={stats} /> : null}
								<span
									className={cn(
										"ml-auto shrink-0 font-mono text-[9px] tabular-nums text-fg-faint transition-colors",
										!compact && "group-hover/commit:text-fg-mute",
										selected && "text-fg-mute",
									)}
									title={commit.hash}
								>
									{shortHash}
								</span>
							</div>
						</div>
					</button>
				</ContextMenuTrigger>
				<ContextMenuContent className="w-56">
					<ContextMenuItem onClick={onCopyHash}>
						{t("changes.log.copyHash")}
					</ContextMenuItem>
					<ContextMenuItem onClick={onReset}>
						<VscHistory className="mr-2 size-4" />
						{t("changes.log.resetHere")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		</div>
	);
}
