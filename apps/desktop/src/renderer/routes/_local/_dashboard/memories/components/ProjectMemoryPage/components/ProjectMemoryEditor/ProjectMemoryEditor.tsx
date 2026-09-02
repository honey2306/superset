import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import type {
	ProjectMemoryCategory,
	ProjectMemoryEditorValue,
} from "../../types";
import { PROJECT_MEMORY_CATEGORIES } from "../../types";

const CATEGORY_LABELS: Record<ProjectMemoryCategory, string> = {
	debugging: "排障",
	architecture: "架构",
	workflow: "工作流",
	environment: "环境",
	preference: "偏好",
	other: "其他",
};

export function ProjectMemoryEditor({
	value,
	isSaving,
	onChange,
	onCancel,
	onSave,
}: {
	value: ProjectMemoryEditorValue;
	isSaving: boolean;
	onChange(value: ProjectMemoryEditorValue): void;
	onCancel(): void;
	onSave(): void;
}) {
	return (
		<div className="rounded-ds-4 border border-info/30 bg-info/5 p-4 shadow-sm ring-1 ring-info/10">
			<div className="space-y-3">
				<Input
					className="border-line-strong bg-background"
					value={value.title}
					onChange={(event) =>
						onChange({ ...value, title: event.target.value })
					}
					placeholder="记忆标题"
				/>
				<Textarea
					className="min-h-28 border-line-strong bg-background text-sm"
					value={value.content}
					onChange={(event) =>
						onChange({ ...value, content: event.target.value })
					}
					placeholder="写下可跨对话复用的结论、步骤和适用条件"
				/>
				<div className="flex flex-wrap items-center gap-1.5">
					{PROJECT_MEMORY_CATEGORIES.map((category) => (
						<button
							type="button"
							key={category}
							className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
								value.category === category
									? "border-info/35 bg-info/10 text-fg"
									: "border-line text-fg-mute hover:border-info/20 hover:bg-info/5 hover:text-fg"
							}`}
							onClick={() => onChange({ ...value, category })}
						>
							{CATEGORY_LABELS[category]}
						</button>
					))}
					<div className="flex-1" />
					<div className="flex items-center gap-2 text-xs text-fg-mute">
						<Switch
							aria-label="置顶"
							checked={value.pinned}
							onCheckedChange={(pinned) => onChange({ ...value, pinned })}
						/>
						<span>置顶</span>
					</div>
				</div>
			</div>
			<div className="mt-4 flex items-center gap-2">
				<span className="text-[11px] text-fg-faint">
					新对话会自动读取已启用的项目记忆
				</span>
				<div className="flex-1" />
				<Button variant="ghost" size="sm" onClick={onCancel}>
					取消
				</Button>
				<Button
					size="sm"
					disabled={isSaving || !value.title.trim() || !value.content.trim()}
					onClick={onSave}
				>
					保存记忆
				</Button>
			</div>
		</div>
	);
}
