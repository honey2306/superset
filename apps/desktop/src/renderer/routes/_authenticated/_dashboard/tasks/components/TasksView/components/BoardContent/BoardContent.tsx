import { HiCheckCircle } from "react-icons/hi2";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { TaskWithStatus } from "../../hooks/useTasksData";
import { useTasksData } from "../../hooks/useTasksData";
import { TasksBoardView } from "../TasksBoardView";
import type { TabValue } from "../TasksTopBar";

interface BoardContentProps {
	filterTab: TabValue;
	searchQuery: string;
	assigneeFilter: string | null;
	linearProjectFilter: string | null;
	onTaskClick: (task: TaskWithStatus) => void;
}

export function BoardContent({
	filterTab,
	searchQuery,
	assigneeFilter,
	linearProjectFilter,
	onTaskClick,
}: BoardContentProps) {
	const { t } = useTranslation();
	const { data, allStatuses } = useTasksData({
		filterTab,
		searchQuery,
		assigneeFilter,
		linearProjectFilter,
	});

	if (data.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center">
				<div className="flex flex-col items-center gap-2 text-fg-mute">
					<HiCheckCircle className="h-8 w-8" />
					<span className="text-sm">{t("tasks.none")}</span>
				</div>
			</div>
		);
	}

	return (
		<TasksBoardView
			data={data}
			allStatuses={allStatuses}
			onTaskClick={onTaskClick}
		/>
	);
}
