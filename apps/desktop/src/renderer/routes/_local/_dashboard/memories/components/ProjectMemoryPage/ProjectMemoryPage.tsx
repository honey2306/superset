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

const GLOBAL_MEMORY_QUERY_SCOPE = "global";

function projectMemoryQueryKey(
	hostUrl: string | null,
	projectId: string | null,
) {
	return [
		"project-memories",
		hostUrl,
		projectId ?? GLOBAL_MEMORY_QUERY_SCOPE,
	] as const;
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
	const activeProjectId =
		selectedProjectId === null ||
		availableProjects.some((project) => project.id === selectedProjectId)
			? selectedProjectId
			: null;
	const memoryScopes = [
		{ projectId: null },
		...availableProjects.map((project) => ({ projectId: project.id })),
	];
	const memoryQueries = useQueries({
		queries: memoryScopes.map(({ projectId }) => ({
			queryKey: projectMemoryQueryKey(hostUrl, projectId),
			enabled: hostUrl !== null,
			queryFn: async () => {
				if (!hostUrl) return [];
				return getHostServiceClientByUrl(hostUrl).project.listMemories.query({
					projectId,
					includeDisabled: true,
					limit: 500,
				});
			},
		})),
	});
	const globalMemories = (memoryQueries[0]?.data ??
		[]) as ProjectMemoryRecord[];
	const memoryCountByProject = useMemo(
		() =>
			new Map(
				availableProjects.map((project, index) => [
					project.id,
					memoryQueries[index + 1]?.data?.filter((memory) => memory.enabled)
						.length ?? 0,
				]),
			),
		[availableProjects, memoryQueries],
	);
	const activeProjectIndex = availableProjects.findIndex(
		(project) => project.id === activeProjectId,
	);
	const activeProject = availableProjects[activeProjectIndex] ?? null;
	const isGlobal = activeProjectId === null;
	const memories = isGlobal
		? globalMemories
		: ((memoryQueries[activeProjectIndex + 1]?.data ??
				[]) as ProjectMemoryRecord[]);
	const visibleMemories = useMemo(
		() => filterProjectMemories(memories, searchQuery, filter),
		[filter, memories, searchQuery],
	);
	const scopeLabel = isGlobal ? "全局记忆" : "项目记忆";

	const invalidateScope = (projectId: string | null) =>
		queryClient.invalidateQueries({
			queryKey: projectMemoryQueryKey(hostUrl, projectId),
		});
	const createMemory = useMutation({
		mutationFn: async (value: ProjectMemoryEditorValue) => {
			if (!hostUrl) throw new Error("Host service is unavailable");
			return getHostServiceClientByUrl(hostUrl).project.createMemory.mutate({
				projectId: activeProjectId,
				title: value.title,
				content: value.content,
				category: value.category,
				pinned: value.pinned,
			});
		},
		onSuccess: () => {
			void invalidateScope(activeProjectId);
			setEditor(null);
			toast.success(`已添加${scopeLabel}`);
		},
		onError: (error) => toast.error(`无法添加${scopeLabel}：${error.message}`),
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
			if (!hostUrl) throw new Error("Host service is unavailable");
			return getHostServiceClientByUrl(hostUrl).project.updateMemory.mutate({
				projectId: activeProjectId,
				memoryId,
				patch,
			});
		},
		onSuccess: () => {
			void invalidateScope(activeProjectId);
			setEditor(null);
		},
		onError: (error) => toast.error(`无法更新${scopeLabel}：${error.message}`),
	});
	const deleteMemory = useMutation({
		mutationFn: async (memoryId: string) => {
			if (!hostUrl) throw new Error("Host service is unavailable");
			return getHostServiceClientByUrl(hostUrl).project.deleteMemory.mutate({
				projectId: activeProjectId,
				memoryId,
			});
		},
		onSuccess: () => {
			void invalidateScope(activeProjectId);
			setPendingDelete(null);
			toast.success(`已删除${scopeLabel}`);
		},
		onError: (error) => toast.error(`无法删除${scopeLabel}：${error.message}`),
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
	const selectProject = (projectId: string | null) => {
		setSelectedProjectId(projectId);
		setSearchQuery("");
		setFilter("all");
		setEditor(null);
	};

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
				globalMemoryCount={
					globalMemories.filter((memory) => memory.enabled).length
				}
				onSelectProject={selectProject}
			/>
			<main className="flex min-h-0 min-w-0 flex-1 flex-col">
				<ProjectMemoryToolbar
					projectName={isGlobal ? "全局记忆" : (activeProject?.name ?? "")}
					isGlobal={isGlobal}
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
								isGlobal={isGlobal}
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
								<h2 className="text-sm font-medium">没有匹配的{scopeLabel}</h2>
								<p className="mt-1 text-xs text-fg-mute">
									{isGlobal
										? "你也可以告诉 Agent 将跨项目知识记为全局记忆。"
										: "你也可以直接告诉 Agent“把这个记住”。"}
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
											isGlobal={isGlobal}
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
						<AlertDialogTitle>删除{scopeLabel}？</AlertDialogTitle>
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
