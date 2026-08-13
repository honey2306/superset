import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useRef } from "react";
import { GoGitPullRequest, GoIssueOpened } from "react-icons/go";
import { HiOutlineMagnifyingGlass, HiXMark } from "react-icons/hi2";
import { useHotkey } from "renderer/hotkeys";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { SelectedIssue } from "../GitHubIssuesContent";
import { ProjectFilter } from "./components/ProjectFilter";
import { RunIssuesInWorkspacePopover } from "./components/RunIssuesInWorkspacePopover";

export type WorkItemTab = "prs" | "issues";

interface TasksTopBarProps {
	searchQuery: string;
	onSearchChange: (query: string) => void;
	selectedIssues?: SelectedIssue[];
	onClearIssueSelection?: () => void;
	typeTab: WorkItemTab;
	onTypeTabChange: (typeTab: WorkItemTab) => void;
	projectFilter: string | null;
	onProjectFilterChange: (projectId: string) => void;
}

export function TasksTopBar({
	searchQuery,
	onSearchChange,
	selectedIssues = [],
	onClearIssueSelection,
	typeTab,
	onTypeTabChange,
	projectFilter,
	onProjectFilterChange,
}: TasksTopBarProps) {
	const { t } = useTranslation();
	const searchInputRef = useRef<HTMLInputElement>(null);
	useHotkey(
		"FOCUS_TASK_SEARCH",
		() => {
			searchInputRef.current?.focus();
			searchInputRef.current?.select();
		},
		{ preventDefault: true },
	);
	const hasSelection = typeTab === "issues" && selectedIssues.length > 0;

	return (
		<div className="@container flex items-center justify-between border-b border-line px-4 h-11 min-w-0 shrink-0">
			<div className="flex items-center gap-2 min-w-0">
				{hasSelection ? (
					<>
						<Button
							variant="ghost"
							size="icon-xs"
							onClick={onClearIssueSelection}
							aria-label={t("tasks.clearSelection")}
						>
							<HiXMark />
						</Button>
						<span className="text-sm font-medium">
							{t("tasks.selected", { count: selectedIssues.length })}
						</span>
						<div className="h-4 w-px bg-border" />
						<RunIssuesInWorkspacePopover
							issues={selectedIssues}
							projectFilter={projectFilter}
							onComplete={onClearIssueSelection ?? (() => {})}
						/>
					</>
				) : (
					<>
						<ProjectFilter
							value={projectFilter}
							onChange={onProjectFilterChange}
						/>
						<div className="h-4 w-px bg-border" />
						<Tabs
							value={typeTab}
							onValueChange={(value) => onTypeTabChange(value as WorkItemTab)}
						>
							<TabsList className="h-8 bg-transparent p-0 gap-0.5">
								<TabsTrigger value="prs" className="h-8 gap-1 px-2">
									<GoGitPullRequest className="size-3.5" />
									<span className="hidden @4xl:inline">
										{t("tasks.pullRequests")}
									</span>
								</TabsTrigger>
								<TabsTrigger value="issues" className="h-8 gap-1 px-2">
									<GoIssueOpened className="size-3.5" />
									<span className="hidden @4xl:inline">
										{t("tasks.issues")}
									</span>
								</TabsTrigger>
							</TabsList>
						</Tabs>
					</>
				)}
			</div>
			<div className="relative w-32 @2xl:w-40 @4xl:w-56 @6xl:w-64">
				<HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-fg-mute pointer-events-none" />
				<Input
					ref={searchInputRef}
					placeholder={
						typeTab === "prs"
							? t("tasks.searchPullRequests")
							: t("tasks.searchIssues")
					}
					value={searchQuery}
					onChange={(event) => onSearchChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							onSearchChange("");
							searchInputRef.current?.blur();
						}
					}}
					className="h-8 pl-9 pr-3 text-sm bg-hover/50 border-0 focus-visible:ring-1"
				/>
			</div>
		</div>
	);
}
