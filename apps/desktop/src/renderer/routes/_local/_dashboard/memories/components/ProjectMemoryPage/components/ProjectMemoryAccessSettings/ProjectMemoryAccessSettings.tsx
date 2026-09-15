import { Button } from "@superset/ui/button";
import { Checkbox } from "@superset/ui/checkbox";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@superset/ui/radio-group";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { LuChevronDown, LuSave } from "react-icons/lu";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type MemoryAccessMode = "off" | "selected" | "all";

interface ProjectMemoryAccessSettingsProps {
	hostUrl: string;
}

function isMemoryAccessMode(value: string): value is MemoryAccessMode {
	return value === "off" || value === "selected" || value === "all";
}

export function ProjectMemoryAccessSettings({
	hostUrl,
}: ProjectMemoryAccessSettingsProps) {
	const queryClient = useQueryClient();
	const queryKey = ["memory-access-settings", hostUrl] as const;
	const initialized = useRef(false);
	const [mode, setMode] = useState<MemoryAccessMode>("off");
	const [projectIds, setProjectIds] = useState<string[]>([]);
	const settings = useQuery({
		queryKey,
		queryFn: async () =>
			getHostServiceClientByUrl(hostUrl).settings.memoryAccess.get.query(),
	});
	const save = useMutation({
		mutationFn: async (value: {
			mode: MemoryAccessMode;
			projectIds: string[];
		}) =>
			getHostServiceClientByUrl(hostUrl).settings.memoryAccess.set.mutate(
				value,
			),
		onSuccess: (saved) => {
			setMode(saved.mode);
			setProjectIds(saved.projectIds);
			queryClient.setQueryData(queryKey, (current) =>
				current ? { ...current, ...saved } : current,
			);
			void queryClient.invalidateQueries({ queryKey });
			toast.success("已保存跨项目记忆访问设置");
		},
		onError: (error) =>
			toast.error(`无法保存跨项目记忆访问设置：${error.message}`),
	});

	useEffect(() => {
		if (!settings.data || initialized.current) return;
		setMode(settings.data.mode);
		setProjectIds(settings.data.projectIds);
		initialized.current = true;
	}, [settings.data]);

	const projects = settings.data?.projects ?? [];
	const availableProjectIds = new Set(projects.map((project) => project.id));
	const disabled = settings.isLoading || save.isPending;
	const toggleProject = (projectId: string, checked: boolean) => {
		setProjectIds((current) =>
			checked
				? [...new Set([...current, projectId])]
				: current.filter((id) => id !== projectId),
		);
	};

	return (
		<Collapsible className="rounded-lg border border-border bg-card px-4 py-3">
			<CollapsibleTrigger className="flex w-full items-center justify-between gap-3 text-left">
				<div>
					<p className="text-sm font-medium">跨项目记忆共享</p>
					<p className="mt-0.5 text-xs text-fg-mute">
						默认关闭；其他项目的 Agent 仅在需要时读取获准项目的记忆。
					</p>
				</div>
				<LuChevronDown className="size-4 shrink-0 text-fg-mute transition-transform [[data-state=open]_&]:rotate-180" />
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-4">
				{settings.isError ? (
					<div className="flex items-center justify-between gap-3">
						<p className="select-text cursor-text text-xs text-destructive">
							无法加载跨项目记忆访问设置：{settings.error.message}
						</p>
						<Button
							size="sm"
							variant="secondary"
							onClick={() => void settings.refetch()}
						>
							重试
						</Button>
					</div>
				) : (
					<div className="space-y-4">
						<RadioGroup
							value={mode}
							disabled={disabled}
							onValueChange={(value) => {
								if (isMemoryAccessMode(value)) setMode(value);
							}}
							className="space-y-2"
						>
							<label
								htmlFor="memory-access-off"
								className="flex cursor-pointer items-start gap-2 text-sm"
							>
								<RadioGroupItem
									id="memory-access-off"
									value="off"
									className="mt-0.5"
								/>
								<span>
									关闭
									<span className="block text-xs text-fg-mute">
										不向其他项目的 Agent 提供项目记忆。
									</span>
								</span>
							</label>
							<label
								htmlFor="memory-access-selected"
								className="flex cursor-pointer items-start gap-2 text-sm"
							>
								<RadioGroupItem
									id="memory-access-selected"
									value="selected"
									className="mt-0.5"
								/>
								<span>
									指定项目
									<span className="block text-xs text-fg-mute">
										仅向其他项目的 Agent 提供下方选中的项目记忆。
									</span>
								</span>
							</label>
							<label
								htmlFor="memory-access-all"
								className="flex cursor-pointer items-start gap-2 text-sm"
							>
								<RadioGroupItem
									id="memory-access-all"
									value="all"
									className="mt-0.5"
								/>
								<span>
									此 host 全部项目
									<span className="block text-xs text-fg-mute">
										允许其他项目的 Agent 读取此 host 上全部项目的项目记忆。
									</span>
								</span>
							</label>
						</RadioGroup>

						{mode === "selected" && (
							<div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border p-3">
								{projects.length === 0 ? (
									<p className="text-xs text-fg-mute">
										此 host 暂无可选择的项目。
									</p>
								) : (
									projects.map((project) => (
										<label
											key={project.id}
											htmlFor={`memory-access-project-${project.id}`}
											className="flex cursor-pointer items-start gap-2 text-sm"
										>
											<Checkbox
												id={`memory-access-project-${project.id}`}
												checked={projectIds.includes(project.id)}
												disabled={disabled}
												onCheckedChange={(checked) =>
													toggleProject(project.id, checked === true)
												}
											/>
											<span className="min-w-0">
												{project.name}
												<span className="block truncate text-xs text-fg-mute">
													{project.repoPath}
												</span>
											</span>
										</label>
									))
								)}
							</div>
						)}
						<div className="flex items-center justify-between gap-3">
							<p className="text-xs text-fg-mute">
								设置只适用于当前组织中的此 host，且只允许按需读取。
							</p>
							<Button
								size="sm"
								disabled={disabled}
								onClick={() =>
									save.mutate({
										mode,
										projectIds:
											mode === "selected"
												? projectIds.filter((id) => availableProjectIds.has(id))
												: [],
									})
								}
							>
								<LuSave className="size-3.5" /> 保存
							</Button>
						</div>
					</div>
				)}
			</CollapsibleContent>
		</Collapsible>
	);
}
