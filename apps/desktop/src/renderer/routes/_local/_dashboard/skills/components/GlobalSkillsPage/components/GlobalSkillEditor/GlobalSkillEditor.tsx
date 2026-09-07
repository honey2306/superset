import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Textarea } from "@superset/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { useState } from "react";
import { LuCheck, LuSparkles } from "react-icons/lu";
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";

export interface GlobalSkillEditorValue {
	originalName?: string;
	name: string;
	description: string;
	instructions: string;
}

type EditorMode = "edit" | "preview";

export function GlobalSkillEditor({
	value,
	isSaving,
	onChange,
	onSave,
}: {
	value: GlobalSkillEditorValue;
	isSaving: boolean;
	onChange(value: GlobalSkillEditorValue): void;
	onSave(): void;
}) {
	const [mode, setMode] = useState<EditorMode>("edit");
	const canSave =
		value.name.trim().length > 0 &&
		value.description.trim().length > 0 &&
		value.instructions.trim().length > 0;

	return (
		<div className="mx-auto flex min-h-full w-full max-w-[820px] flex-col px-8 pb-10 pt-14">
			<div className="mb-5 flex items-center gap-2 font-mono text-[9px] font-medium tracking-[0.12em] text-fg-faint">
				<span className="flex size-5 items-center justify-center rounded-ds-3 bg-accent-tint text-accent">
					<LuSparkles className="size-3" />
				</span>
				GLOBAL SKILL
			</div>

			<Input
				aria-label="Skill name"
				variant="ghost"
				value={value.name}
				placeholder="untitled-skill"
				className="h-auto border-0 pb-0 font-mono text-[36px] font-semibold leading-tight tracking-[-0.05em] focus-visible:border-0"
				onChange={(event) => onChange({ ...value, name: event.target.value })}
			/>
			<Textarea
				aria-label="Skill description"
				value={value.description}
				placeholder="描述这个 Skill 应该在什么时候使用"
				rows={1}
				className="mt-3 min-h-7 resize-none border-0 bg-transparent px-0 py-0 text-sm leading-7 text-fg-mute shadow-none focus-visible:border-0 focus-visible:ring-0"
				onChange={(event) =>
					onChange({ ...value, description: event.target.value })
				}
			/>
			<div className="mt-4 flex items-center gap-2 text-[10px] text-fg-faint">
				<span>在任务匹配时自动加载</span>
				<span className="h-2.5 w-px bg-line" />
				<span>新会话生效</span>
			</div>

			<div className="mt-10 flex items-center gap-3">
				<span className="font-mono text-[9px] font-medium tracking-[0.12em] text-fg-faint">
					INSTRUCTIONS
				</span>
				<span className="h-px flex-1 bg-line" />
				<ToggleGroup
					type="single"
					value={mode}
					onValueChange={(nextMode) => {
						if (nextMode === "edit" || nextMode === "preview") {
							setMode(nextMode);
						}
					}}
					size="sm"
					className="h-6 rounded-ds-3 bg-hover/50 p-0.5"
				>
					<ToggleGroupItem
						value="edit"
						className="h-5 px-2 text-[10px] text-fg-mute data-[state=on]:bg-background data-[state=on]:text-fg data-[state=on]:shadow-sm"
					>
						编辑
					</ToggleGroupItem>
					<ToggleGroupItem
						value="preview"
						className="h-5 px-2 text-[10px] text-fg-mute data-[state=on]:bg-background data-[state=on]:text-fg data-[state=on]:shadow-sm"
					>
						预览
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			{mode === "edit" ? (
				<Textarea
					aria-label="Skill instructions"
					value={value.instructions}
					placeholder="# 工作流\n\n描述 Agent 应遵循的步骤和约束。"
					className="mt-5 min-h-[420px] resize-none border-0 bg-transparent px-0 py-0 font-mono text-[13px] leading-7 text-fg shadow-none focus-visible:border-0 focus-visible:ring-0"
					onChange={(event) =>
						onChange({ ...value, instructions: event.target.value })
					}
				/>
			) : (
				<MarkdownRenderer
					content={value.instructions}
					style="default"
					className="mt-5 min-h-[420px] overflow-visible [&>article]:max-w-none [&>article]:px-0 [&>article]:py-0"
				/>
			)}

			<div className="mt-auto flex items-center justify-between gap-4 border-t border-line pt-4 text-[10px] text-fg-faint">
				<span className="flex items-center gap-2">
					<span className="size-1.5 rounded-full bg-success" />
					可被新会话发现
				</span>
				<Button
					variant="primary"
					size="sm"
					disabled={!canSave || isSaving}
					onClick={onSave}
				>
					<LuCheck className="size-3" />
					{isSaving ? "保存中…" : "保存"}
				</Button>
			</div>
		</div>
	);
}
