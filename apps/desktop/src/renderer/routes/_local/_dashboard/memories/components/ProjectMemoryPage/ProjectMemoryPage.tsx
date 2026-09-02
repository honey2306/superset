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
import { toast } from "@superset/ui/sonner";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LuBookOpen, LuPlus } from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useCatalogProjects } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";
import { isTemporaryProject } from "renderer/utils/isTemporaryProject";
import { ProjectMemoryEditor } from "./components/ProjectMemoryEditor";
import { ProjectMemoryItem } from "./components/ProjectMemoryItem";
import { ProjectMemorySidebar } from "./components/ProjectMemorySidebar";
import {
	type ProjectMemoryFilter,
	ProjectMemoryToolbar,
} from "./components/ProjectMemoryToolbar";
import { filterProjectMemories } from "./projectMemoryView";
import {
	EMPTY_PROJECT_MEMORY_EDITOR,
	type ProjectMemoryEditorValue,
	type ProjectMemoryRecord,
} from "./types";

function projectMemoryQueryKey(hostUrl: string | null, projectId: string) {
	return ["project-memories", hostUrl, projectId] as const;
}

export function ProjectMemoryPage() {
	const { activeHostUrl: hostUrl } = useLocalHostService();
	const { projects } = useCatalogProjects();
	const queryClient = useQueryClient();
	const availableProjects = useMemo(
		() => projects.filter((project) => !isTemporaryProject(project)),
		[projects],
	);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [searchQuery, setSearchQuery] = useState("");
	const [filter, setFilter] = useState<ProjectMemoryFilter>("all");
	const [editor, setEditor] = useState<ProjectMemoryEditorValue | null>(null);
	const [pendingDelete, setPendingDelete] =
		useState<ProjectMemoryRecord | null>(null);
	const activeProjectId = availableProjects.some(
		(project) => project.id === selectedProjectId,
	)
		? selectedProjectId
		: (availableProjects[0]?.id ?? null);
	const memoryQueries = useQueries({
		queries: availableProjects.map((project) => ({
			queryKey: projectMemoryQueryKey(hostUrl, project.id),
			enabled: hostUrl !== null,
			queryFn: async () => {
				if (!hostUrl) return [];
				return getHostServiceClientByUrl(hostUrl).project.listMemories.query({
					projectId: project.id,
					includeDisabled: true,
					limit: 500,
				});
			},
		})),
	});
	const memoryCountByProject = useMemo(
		() =>
			new Map(
				availableProjects.map((project, index) => [
					project.id,
					memoryQueries[index]?.data?.filter((memory) => memory.enabled)
						.length ?? 0,
				]),
			),
		[availableProjects, memoryQueries],
	);
	const activeProjectIndex = availableProjects.findIndex(
		(project) => project.id === activeProjectId,
	);
	const activeProject = availableProjects[activeProjectIndex] ?? null;
	const memories = (memoryQueries[activeProjectIndex]?.data ??
		[]) as ProjectMemoryRecord[];
	const visibleMemories = useMemo(
		() => filterProjectMemories(memories, searchQuery, filter),
		[filter, memories, searchQuery],
	);

	const invalidateProject = (projectId: string) =>
		queryClient.invalidateQueries({
			queryKey: projectMemoryQueryKey(hostUrl, projectId),
		});
	const createMemory = useMutation({
		mutationFn: async (value: ProjectMemoryEditorValue) => {
			if (!hostUrl || !activeProjectId)
				throw new Error("Project host is unavailable");
			return getHostServiceClientByUrl(hostUrl).project.createMemory.mutate({
				projectId: activeProjectId,
				title: value.title,
				content: value.content,
				category: value.category,
				pinned: value.pinned,
			});
		},
		onSuccess: () => {
			if (activeProjectId) void invalidateProject(activeProjectId);
			setEditor(null);
			toast.success("已添加项目记忆");
		},
		onError: (error) => toast.error(`无法添加项目记忆：${error.message}`),
	});
	const updateMemory = useMutation({
		mutationFn: async ({
			memoryId,
			patch,
		}: {
			memoryId: string;
			patch: Partial<
				Pick<
					ProjectMemoryRecord,
					"title" | "content" | "category" | "pinned" | "enabled"
				>
			>;
		}) => {
			if (!hostUrl || !activeProjectId)
				throw new Error("Project host is unavailable");
			return getHostServiceClientByUrl(hostUrl).project.updateMemory.mutate({
				projectId: activeProjectId,
				memoryId,
				patch,
			});
		},
		onSuccess: () => {
			if (activeProjectId) void invalidateProject(activeProjectId);
			setEditor(null);
		},
		onError: (error) => toast.error(`无法更新项目记忆：${error.message}`),
	});
	const deleteMemory = useMutation({
		mutationFn: async (memoryId: string) => {
			if (!hostUrl || !activeProjectId)
				throw new Error("Project host is unavailable");
			return getHostServiceClientByUrl(hostUrl).project.deleteMemory.mutate({
				projectId: activeProjectId,
				memoryId,
			});
		},
		onSuccess: () => {
			if (activeProjectId) void invalidateProject(activeProjectId);
			setPendingDelete(null);
			toast.success("已删除项目记忆");
		},
		onError: (error) => toast.error(`无法删除项目记忆：${error.message}`),
	});

	const openEditor = (memory?: ProjectMemoryRecord) => {
		setEditor(
			memory
				? {
						id: memory.id,
						title: memory.title,
						content: memory.content,
						category: memory.category,
						pinned: memory.pinned,
					}
				: { ...EMPTY_PROJECT_MEMORY_EDITOR },
		);
	};
	const saveEditor = () => {
		if (!editor) return;
		if (editor.id) {
			updateMemory.mutate({
				memoryId: editor.id,
				patch: {
					title: editor.title,
					content: editor.content,
					category: editor.category,
					pinned: editor.pinned,
				},
			});
			return;
		}
		createMemory.mutate(editor);
	};
	const selectProject = (projectId: string) => {
		setSelectedProjectId(projectId);
		setSearchQuery("");
		setFilter("all");
		setEditor(null);
	};

	if (availableProjects.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 bg-background text-center">
				<LuBookOpen className="size-8 text-fg-faint" />
				<div>
					<h1 className="font-semibold">还没有项目</h1>
					<p className="mt-1 text-sm text-fg-mute">
						添加代码仓库后即可使用项目记忆。
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 w-full bg-background">
			<ProjectMemorySidebar
				projects={availableProjects.map((project) => ({
					id: project.id,
					name: project.name,
					repoPath: project.repoPath,
				}))}
				selectedProjectId={activeProjectId}
				memoryCountByProject={memoryCountByProject}
				onSelectProject={selectProject}
			/>
			<main className="flex min-h-0 min-w-0 flex-1 flex-col">
				<ProjectMemoryToolbar
					projectName={activeProject?.name ?? ""}
					count={memories.length}
					query={searchQuery}
					filter={filter}
					onQueryChange={setSearchQuery}
					onFilterChange={setFilter}
					onCreate={() => openEditor()}
				/>
				<div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
					{editor?.id === null && (
						<div className="mb-3">
							<ProjectMemoryEditor
								value={editor}
								isSaving={createMemory.isPending}
								onChange={setEditor}
								onCancel={() => setEditor(null)}
								onSave={saveEditor}
							/>
						</div>
					)}
					{visibleMemories.length === 0 ? (
						<div className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
							<LuBookOpen className="size-7 text-fg-faint" />
							<div>
								<h2 className="text-sm font-medium">没有匹配的项目记忆</h2>
								<p className="mt-1 text-xs text-fg-mute">
									你也可以直接告诉 Agent“把这个记住”。
								</p>
							</div>
							<Button
								size="sm"
								variant="secondary"
								onClick={() => openEditor()}
							>
								<LuPlus className="size-3.5" /> 添加记忆
							</Button>
						</div>
					) : (
						<div className="space-y-3">
							{visibleMemories.map((memory) => (
								<div key={memory.id} className="space-y-3">
									<ProjectMemoryItem
										memory={memory}
										selected={editor?.id === memory.id}
										onEdit={() => openEditor(memory)}
										onTogglePinned={() =>
											updateMemory.mutate({
												memoryId: memory.id,
												patch: { pinned: !memory.pinned },
											})
										}
										onToggleEnabled={() =>
											updateMemory.mutate({
												memoryId: memory.id,
												patch: { enabled: !memory.enabled },
											})
										}
										onDelete={() => setPendingDelete(memory)}
									/>
									{editor?.id === memory.id && (
										<ProjectMemoryEditor
											value={editor}
											isSaving={updateMemory.isPending}
											onChange={setEditor}
											onCancel={() => setEditor(null)}
											onSave={saveEditor}
										/>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</main>
			<AlertDialog
				open={pendingDelete !== null}
				onOpenChange={(open) => !open && setPendingDelete(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>删除项目记忆？</AlertDialogTitle>
						<AlertDialogDescription>
							“{pendingDelete?.title}”将不再提供给后续 Agent 对话。
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>取消</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deleteMemory.isPending}
							onClick={() =>
								pendingDelete && deleteMemory.mutate(pendingDelete.id)
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
