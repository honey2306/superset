import { useNow } from "renderer/hooks/useNow";
import { useTranslation } from "renderer/providers/I18nProvider";
import { sortTimelineItems, type TimelineItem } from "./sortTimelineItems";
import { TimelineRow } from "./TimelineRow";

interface TimelineViewProps {
	items: TimelineItem[];
}

/**
 * 时间线视图：所有 workspace 平铺成一条活动流，正在进行的浮在最前。
 * 不分组、不排序——顺序由「谁最近在动」决定。
 */
export function TimelineView({ items }: TimelineViewProps) {
	const { t } = useTranslation();
	// 30s 一跳就够：相对时间显示的是分钟级粒度
	const now = useNow(30_000);
	const sorted = sortTimelineItems(items);

	if (sorted.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-32 text-fg-mute text-sm">
				<span>{t("workspace.none")}</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-1.5 px-[14px]">
			{sorted.map((item) => (
				<TimelineRow key={item.workspaceId} item={item} now={now} />
			))}
		</div>
	);
}
