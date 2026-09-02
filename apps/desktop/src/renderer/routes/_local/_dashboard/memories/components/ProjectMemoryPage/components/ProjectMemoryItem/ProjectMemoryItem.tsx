import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import {
	LuBookOpen,
	LuEye,
	LuEyeOff,
	LuPencil,
	LuPin,
	LuPinOff,
	LuSparkles,
	LuTrash2,
} from "react-icons/lu";
import type { ProjectMemoryCategory, ProjectMemoryRecord } from "../../types";

const CATEGORY_LABELS: Record<ProjectMemoryCategory, string> = {
	debugging: "排障",
	architecture: "架构",
	workflow: "工作流",
	environment: "环境",
	preference: "偏好",
	other: "其他",
};

const CATEGORY_DOT_CLASSES: Record<ProjectMemoryCategory, string> = {
	debugging: "bg-warning",
	architecture: "bg-primary",
	workflow: "bg-info",
	environment: "bg-fg-faint",
	preference: "bg-warning",
	other: "bg-fg-faint",
};

function formatUpdatedAt(value: number): string {
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(value);
}

export function ProjectMemoryItem({
	memory,
	selected,
	onEdit,
	onTogglePinned,
	onToggleEnabled,
	onDelete,
}: {
	memory: ProjectMemoryRecord;
	selected: boolean;
	onEdit(): void;
	onTogglePinned(): void;
	onToggleEnabled(): void;
	onDelete(): void;
}) {
	return (
		<div
			className={cn(
				"grid grid-cols-[18px_minmax(0,1fr)_auto] gap-3 rounded-ds-4 border bg-surface px-4 py-3 transition-colors",
				selected
					? "border-info/35 bg-info/5 ring-1 ring-info/10"
					: "border-line hover:border-info/20 hover:bg-info/5",
				!memory.enabled && "opacity-55",
			)}
		>
			<div
				className={
					memory.pinned ? "pt-0.5 text-primary" : "pt-0.5 text-fg-faint"
				}
			>
				{memory.pinned ? (
					<LuSparkles className="size-3.5" />
				) : (
					<LuBookOpen className="size-3.5" />
				)}
			</div>
			<div className="min-w-0">
				<div className="text-sm font-semibold text-fg">{memory.title}</div>
				<p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-fg-mute select-text cursor-text">
					{memory.content}
				</p>
				<div className="mt-2.5 flex flex-wrap items-center gap-2 text-[10px] text-fg-faint">
					<span className="inline-flex items-center gap-1.5 rounded-full bg-hover px-2 py-0.5 text-fg-mute">
						<span
							className={cn(
								"size-1.5 rounded-full",
								CATEGORY_DOT_CLASSES[memory.category],
							)}
						/>
						{CATEGORY_LABELS[memory.category]}
					</span>
					<span className="inline-flex items-center gap-1 font-mono">
						{memory.source === "agent" ? (
							<LuSparkles className="size-3" />
						) : (
							<LuPencil className="size-3" />
						)}
						{memory.source === "agent" ? "Agent" : "手动"}
					</span>
					<span>·</span>
					<span>{formatUpdatedAt(memory.updatedAt)}</span>
					{!memory.enabled && (
						<span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
							已停用
						</span>
					)}
				</div>
			</div>
			<div className="flex items-start gap-0.5">
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					title={memory.pinned ? "取消置顶" : "置顶"}
					onClick={onTogglePinned}
				>
					{memory.pinned ? (
						<LuPinOff className="size-3.5" />
					) : (
						<LuPin className="size-3.5" />
					)}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					title={memory.enabled ? "停用" : "启用"}
					onClick={onToggleEnabled}
				>
					{memory.enabled ? (
						<LuEye className="size-3.5" />
					) : (
						<LuEyeOff className="size-3.5" />
					)}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					title="编辑"
					onClick={onEdit}
				>
					<LuPencil className="size-3.5" />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 text-fg-mute hover:text-destructive"
					title="删除"
					onClick={onDelete}
				>
					<LuTrash2 className="size-3.5" />
				</Button>
			</div>
		</div>
	);
}
