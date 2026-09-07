import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
	LuEllipsis,
	LuFolderOpen,
	LuPlus,
	LuSearch,
	LuSparkles,
	LuTrash2,
} from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import {
	GlobalSkillEditor,
	type GlobalSkillEditorValue,
} from "./components/GlobalSkillEditor";

interface GlobalSkill {
	name: string;
	description: string;
	instructions: string;
	filePath: string;
}

interface PendingSelection {
	selectedName: string | null;
	editor: GlobalSkillEditorValue;
}

const EMPTY_EDITOR: GlobalSkillEditorValue = {
	name: "untitled-skill",
	description: "",
	instructions: "# Untitled skill\n\n写下 Agent 应遵循的步骤和约束。",
};

function toEditorValue(skill: GlobalSkill): GlobalSkillEditorValue {
	return {
		originalName: skill.name,
		name: skill.name,
		description: skill.description,
		instructions: skill.instructions,
	};
}

export function GlobalSkillsPage() {
	const { activeHostUrl: hostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const queryKey = ["global-skills", hostUrl] as const;
	const [selectedName, setSelectedName] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [editor, setEditor] = useState<GlobalSkillEditorValue | null>(null);
	const [savedEditor, setSavedEditor] = useState<GlobalSkillEditorValue | null>(
		null,
	);
	const [pendingDeleteName, setPendingDeleteName] = useState<string | null>(
		null,
	);
	const [pendingSelection, setPendingSelection] =
		useState<PendingSelection | null>(null);
	const settings = useQuery({
		queryKey,
		enabled: hostUrl !== null,
		queryFn: async () => {
			if (!hostUrl) throw new Error("Host service is unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.globalSkills.list.query();
		},
	});
	const skills = useMemo(
		() => (settings.data?.skills ?? []) as GlobalSkill[],
		[settings.data?.skills],
	);
	const visibleSkills = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		if (!normalizedQuery) return skills;
		return skills.filter((skill) =>
			`${skill.name} ${skill.description}`
				.toLocaleLowerCase()
				.includes(normalizedQuery),
		);
	}, [query, skills]);
	const isDirty =
		editor !== null && JSON.stringify(editor) !== JSON.stringify(savedEditor);

	useEffect(() => {
		if (editor || skills.length === 0) return;
		const selected =
			skills.find((skill) => skill.name === selectedName) ?? skills[0];
		if (!selected) return;
		const nextEditor = toEditorValue(selected);
		setSelectedName(selected.name);
		setEditor(nextEditor);
		setSavedEditor(nextEditor);
	}, [editor, selectedName, skills]);

	const save = useMutation({
		mutationFn: async (value: GlobalSkillEditorValue) => {
			if (!hostUrl) throw new Error("Host service is unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.globalSkills.upsert.mutate({
				...(value.originalName ? { previousName: value.originalName } : {}),
				skill: {
					name: value.name.trim(),
					description: value.description.trim(),
					instructions: value.instructions.trim(),
				},
			});
		},
		onSuccess: ({ skill }) => {
			void queryClient.invalidateQueries({ queryKey });
			const nextEditor = toEditorValue(skill as GlobalSkill);
			setSelectedName(skill.name);
			setEditor(nextEditor);
			setSavedEditor(nextEditor);
			toast.success(`已保存 ${skill.name}`);
		},
		onError: (error) => toast.error(`无法保存全局 Skill：${error.message}`),
	});
	const remove = useMutation({
		mutationFn: async (name: string) => {
			if (!hostUrl) throw new Error("Host service is unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).settings.globalSkills.remove.mutate({ name });
		},
		onSuccess: (result, removedName) => {
			setPendingDeleteName(null);
			const remainingSkills = result.skills as GlobalSkill[];
			const nextSkill = remainingSkills[0];
			if (nextSkill) {
				const nextEditor = toEditorValue(nextSkill);
				setSelectedName(nextSkill.name);
				setEditor(nextEditor);
				setSavedEditor(nextEditor);
			} else {
				setSelectedName(null);
				setEditor(null);
				setSavedEditor(null);
			}
			queryClient.setQueryData(queryKey, {
				directory: settings.data?.directory ?? "",
				skills: remainingSkills,
			});
			void queryClient.invalidateQueries({ queryKey });
			toast.success(`已删除 ${removedName}`);
		},
		onError: (error) => toast.error(`无法删除全局 Skill：${error.message}`),
	});

	const applySelection = ({
		selectedName: nextSelectedName,
		editor: nextEditor,
	}: PendingSelection) => {
		setSelectedName(nextSelectedName);
		setEditor(nextEditor);
		setSavedEditor(nextSelectedName ? nextEditor : null);
		setPendingSelection(null);
	};
	const requestSelection = (selection: PendingSelection) => {
		if (isDirty) {
			setPendingSelection(selection);
			return;
		}
		applySelection(selection);
	};
	const selectSkill = (skill: GlobalSkill) => {
		requestSelection({
			selectedName: skill.name,
			editor: toEditorValue(skill),
		});
	};
	const createSkill = () => {
		requestSelection({
			selectedName: null,
			editor: { ...EMPTY_EDITOR },
		});
	};

	return (
		<div className="flex h-full min-h-0 w-full bg-background">
			<aside className="flex w-[268px] min-w-[268px] flex-col border-r border-line bg-sidebar">
				<header className="flex h-[66px] items-center justify-between px-4">
					<div className="flex items-center gap-2.5 text-sm font-semibold">
						<span className="flex size-6 items-center justify-center rounded-ds-3 border border-line bg-surface text-accent">
							<LuSparkles className="size-3.5" />
						</span>
						Skills
					</div>
					<Button
						variant="ghost"
						size="icon"
						title="新建 Skill"
						onClick={createSkill}
					>
						<LuPlus className="size-3.5" />
					</Button>
				</header>

				<div className="px-3 pb-4">
					<div className="relative">
						<LuSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-faint" />
						<Input
							value={query}
							placeholder="搜索"
							className="h-8 pl-8"
							onChange={(event) => setQuery(event.target.value)}
						/>
					</div>
				</div>
				<div className="flex items-center justify-between border-y border-line px-4 py-2 font-mono text-[9px] font-medium tracking-[0.08em] text-fg-faint">
					<span>全部</span>
					<span>{visibleSkills.length}</span>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-2">
					{visibleSkills.map((skill) => (
						<button
							key={skill.name}
							type="button"
							className={cn(
								"grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-ds-3 px-3 py-2.5 text-left transition-colors hover:bg-hover",
								selectedName === skill.name && "bg-accent-tint",
							)}
							onClick={() => selectSkill(skill)}
						>
							<span className="min-w-0">
								<strong className="block truncate font-mono text-[11.5px] font-medium text-fg">
									{skill.name}
								</strong>
								<span className="mt-1 block truncate text-[10.5px] text-fg-mute">
									{skill.description}
								</span>
							</span>
						</button>
					))}
					{visibleSkills.length === 0 && !settings.isLoading && (
						<p className="px-3 py-8 text-center text-xs text-fg-faint">
							没有匹配的 Skills
						</p>
					)}
				</div>

				<footer className="flex h-11 items-center gap-2 border-t border-line px-4 text-[10px] text-fg-faint">
					<span className="size-1.5 rounded-full bg-success" />
					<span>全局可用</span>
					<span className="ml-auto truncate font-mono">
						{settings.data?.directory ?? "~/.agents/skills"}
					</span>
				</footer>
			</aside>

			<main className="flex min-h-0 min-w-0 flex-1 flex-col">
				<header className="flex h-[51px] items-center justify-between gap-4 border-b border-line px-5">
					<div className="flex min-w-0 items-center gap-2 text-[10.5px] text-fg-faint">
						<span>Global</span>
						<span>/</span>
						<strong className="truncate font-mono font-medium text-fg-mute">
							{editor?.name || "untitled-skill"}
						</strong>
					</div>
					<div className="flex items-center gap-1.5">
						<span
							className={cn(
								"mr-1 flex items-center gap-1.5 text-[10px] text-fg-faint",
								isDirty && "text-warning",
							)}
						>
							<span
								className={cn(
									"size-1.5 rounded-full bg-success",
									isDirty && "bg-warning",
								)}
							/>
							{isDirty ? "未保存" : "已保存"}
						</span>
						{editor?.originalName && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" size="icon-sm">
										<LuEllipsis className="size-3.5" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="min-w-48">
									<DropdownMenuItem disabled>
										<LuFolderOpen /> 在 Finder 中显示
									</DropdownMenuItem>
									<DropdownMenuItem
										variant="destructive"
										onSelect={() =>
											setPendingDeleteName(editor.originalName ?? null)
										}
									>
										<LuTrash2 /> 删除 Skill
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				</header>

				<div className="min-h-0 flex-1 overflow-y-auto">
					{settings.isError ? (
						<div className="mx-auto mt-12 max-w-xl rounded-ds-4 border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
							{settings.error.message}
						</div>
					) : editor ? (
						<GlobalSkillEditor
							value={editor}
							isSaving={save.isPending}
							onChange={setEditor}
							onSave={() => save.mutate(editor)}
						/>
					) : !settings.isLoading ? (
						<div className="flex h-full flex-col items-center justify-center gap-3 text-center">
							<LuSparkles className="size-6 text-fg-faint" />
							<div>
								<h2 className="text-sm font-medium">还没有全局 Skill</h2>
								<p className="mt-1 text-xs text-fg-mute">
									创建后，支持 Agent Skills 的新会话会自动发现它。
								</p>
							</div>
							<Button size="sm" variant="secondary" onClick={createSkill}>
								<LuPlus className="size-3.5" /> 新建 Skill
							</Button>
						</div>
					) : null}
				</div>
			</main>

			<AlertDialog
				open={pendingSelection !== null}
				onOpenChange={(open) => !open && setPendingSelection(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>放弃未保存的更改？</AlertDialogTitle>
						<AlertDialogDescription>
							当前 Skill 的修改尚未保存。继续后这些修改将丢失。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>继续编辑</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() =>
								pendingSelection && applySelection(pendingSelection)
							}
						>
							放弃更改
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={pendingDeleteName !== null}
				onOpenChange={(open) => !open && setPendingDeleteName(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>删除全局 Skill？</AlertDialogTitle>
						<AlertDialogDescription>
							“{pendingDeleteName}”将不再提供给后续 Agent 会话。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>取消</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={remove.isPending}
							onClick={() =>
								pendingDeleteName && remove.mutate(pendingDeleteName)
							}
						>
							删除
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
