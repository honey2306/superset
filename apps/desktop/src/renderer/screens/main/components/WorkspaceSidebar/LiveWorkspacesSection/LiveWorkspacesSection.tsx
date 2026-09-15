import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { HiChevronRight } from "react-icons/hi2";
import { useTranslation } from "renderer/providers/I18nProvider";
import { LiveWorkspaceRow } from "./LiveWorkspaceRow";
import type { LiveWorkspaceRowItem } from "./types";
import { useLiveWorkspacePullRequests } from "./useLiveWorkspacePullRequests";

interface LiveWorkspacesSectionProps {
	items: LiveWorkspaceRowItem[];
	isCollapsed: boolean;
	onToggleCollapsed: () => void;
}

/** 「置顶进行中」虚拟组：聚合所有有 agent 活动的 workspace，常驻滚动区顶部。 */
export function LiveWorkspacesSection({
	items,
	isCollapsed,
	onToggleCollapsed,
}: LiveWorkspacesSectionProps) {
	const { t } = useTranslation();
	const workspaceIds = useMemo(
		() => items.map((item) => item.workspaceId),
		[items],
	);
	const pullRequests = useLiveWorkspacePullRequests(workspaceIds);

	return (
		<div className="mb-5">
			<div className="sticky top-0 z-10 flex items-center w-full h-7 pl-[34px] pr-[22px] bg-sidebar text-[11px] font-semibold uppercase tracking-[0.05em] text-fg">
				<button
					type="button"
					aria-expanded={!isCollapsed}
					onClick={onToggleCollapsed}
					className="flex items-center flex-1 min-w-0 text-left cursor-pointer"
				>
					{/* 与 ProjectGroupSection 同构：箭头常驻 guide 线正上方（中心 21px） */}
					<HiChevronRight
						className={cn(
							"absolute left-[15px] size-3 text-fg-faint transition-transform duration-150",
							!isCollapsed && "rotate-90",
						)}
					/>
					<span className="shrink-0 truncate">{t("workspace.ongoing")}</span>
				</button>
				{/* 进行中计数用 accent 突出——它就是这一组存在的理由 */}
				<span className="bg-accent-tint text-accent rounded-full px-1.5 font-mono text-[10px] tabular-nums font-normal normal-case">
					{items.length}
				</span>
			</div>

			<AnimatePresence initial={false}>
				{!isCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="relative overflow-hidden"
					>
						<div
							aria-hidden="true"
							className="absolute left-[21px] top-0 bottom-4 w-px bg-line"
						/>
						{/* 行盒挂在 guide 线右侧，与普通项目行同一几何 */}
						<div className="ml-[25px] mr-[6px]">
							{items.map((item) => (
								<LiveWorkspaceRow
									key={item.workspaceId}
									item={item}
									pullRequest={pullRequests.get(item.workspaceId)}
								/>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
