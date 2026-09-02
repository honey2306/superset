import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { LuPlus, LuSearch } from "react-icons/lu";

export type ProjectMemoryFilter =
	| "all"
	| "pinned"
	| "debugging"
	| "architecture"
	| "workflow"
	| "disabled";

const FILTERS: Array<{ value: ProjectMemoryFilter; label: string }> = [
	{ value: "all", label: "全部" },
	{ value: "pinned", label: "置顶" },
	{ value: "debugging", label: "排障" },
	{ value: "architecture", label: "架构" },
	{ value: "workflow", label: "工作流" },
	{ value: "disabled", label: "已停用" },
];

export function ProjectMemoryToolbar({
	projectName,
	count,
	query,
	filter,
	onQueryChange,
	onFilterChange,
	onCreate,
}: {
	projectName: string;
	count: number;
	query: string;
	filter: ProjectMemoryFilter;
	onQueryChange(value: string): void;
	onFilterChange(value: ProjectMemoryFilter): void;
	onCreate(): void;
}) {
	return (
		<header className="border-b border-line bg-surface">
			<div className="flex items-center gap-3 px-6 pb-3 pt-4">
				<h2 className="text-lg font-semibold tracking-tight">{projectName}</h2>
				<span className="font-mono text-xs text-fg-mute">{count} 条记忆</span>
				<div className="flex-1" />
				<div className="relative w-72">
					<LuSearch className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-mute" />
					<Input
						className="h-8 border-line-strong bg-surface pl-8 text-xs"
						value={query}
						onChange={(event) => onQueryChange(event.target.value)}
						placeholder="搜索当前项目记忆…"
					/>
				</div>
				<Button size="sm" onClick={onCreate}>
					<LuPlus className="size-3.5" />
					添加记忆
				</Button>
			</div>
			<div className="flex items-center gap-1.5 px-6 pb-3">
				{FILTERS.map((item) => (
					<button
						type="button"
						key={item.value}
						className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
							filter === item.value
								? "border-info/35 bg-info/10 text-fg"
								: "border-line text-fg-mute hover:border-info/20 hover:bg-info/5 hover:text-fg"
						}`}
						onClick={() => onFilterChange(item.value)}
					>
						{item.label}
					</button>
				))}
				<div className="flex-1" />
				<span className="text-[11px] text-fg-faint">置顶优先 · 最近更新</span>
			</div>
		</header>
	);
}
