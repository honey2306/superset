import { Input } from "@superset/ui/input";
import { useMemo, useState } from "react";
import { LuSearch } from "react-icons/lu";

interface MemoryProject {
	id: string;
	name: string;
	repoPath: string;
}

export function ProjectMemorySidebar({
	projects,
	selectedProjectId,
	memoryCountByProject,
	onSelectProject,
}: {
	projects: MemoryProject[];
	selectedProjectId: string | null;
	memoryCountByProject: ReadonlyMap<string, number>;
	onSelectProject(projectId: string): void;
}) {
	const [query, setQuery] = useState("");
	const visibleProjects = useMemo(() => {
		const normalized = query.trim().toLocaleLowerCase();
		if (!normalized) return projects;
		return projects.filter((project) =>
			`${project.name} ${project.repoPath}`
				.toLocaleLowerCase()
				.includes(normalized),
		);
	}, [projects, query]);

	return (
		<aside className="flex min-h-0 w-56 shrink-0 flex-col border-r border-line bg-surface/30">
			<div className="border-b border-line px-5 py-4">
				<div className="text-[10px] font-medium uppercase tracking-[0.16em] text-fg-faint">
					Project memory
				</div>
				<h1 className="mt-1 text-base font-semibold">项目记忆</h1>
			</div>
			<div className="border-b border-line p-3">
				<div className="relative">
					<LuSearch className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-mute" />
					<Input
						className="h-8 border-line-strong bg-surface pl-8 text-xs"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="筛选项目…"
					/>
				</div>
			</div>
			<div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
				{visibleProjects.map((project) => {
					const selected = project.id === selectedProjectId;
					return (
						<button
							type="button"
							key={project.id}
							className={`grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2 rounded-ds-3 border-l-2 px-2.5 py-2 text-left transition-colors ${
								selected
									? "border-l-info bg-info/10 text-fg"
									: "border-l-transparent text-fg-mute hover:bg-info/5 hover:text-fg"
							}`}
							onClick={() => onSelectProject(project.id)}
						>
							<span className="flex size-6 items-center justify-center rounded-ds-3 border border-line bg-hover font-mono text-[10px]">
								{project.name.slice(0, 1).toLocaleUpperCase()}
							</span>
							<span className="min-w-0">
								<span className="block truncate text-xs font-medium">
									{project.name}
								</span>
								<span className="block truncate font-mono text-[9px] text-fg-faint">
									{project.repoPath}
								</span>
							</span>
							<span className="font-mono text-[10px] tabular-nums text-fg-faint">
								{memoryCountByProject.get(project.id) ?? 0}
							</span>
						</button>
					);
				})}
			</div>
		</aside>
	);
}
