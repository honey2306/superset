import { useNavigate } from "@tanstack/react-router";
import {
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useWorkspaceCatalog } from "renderer/routes/_local/providers/WorkspaceCatalogProvider";
import {
	GitHubIssuesContent,
	type SelectedIssue,
} from "./components/GitHubIssuesContent";
import { PullRequestsContent } from "./components/PullRequestsContent";
import { TasksTopBar, type WorkItemTab } from "./components/TasksTopBar";

interface TasksViewProps {
	initialSearch?: string;
	initialType?: WorkItemTab;
	initialProject?: string;
}

interface TasksSearch {
	search?: string;
	type: WorkItemTab;
	project?: string;
}

export function TasksView({
	initialSearch,
	initialType,
	initialProject,
}: TasksViewProps) {
	const navigate = useNavigate();
	const [searchQuery, setSearchQuery] = useState(initialSearch ?? "");
	const deferredSearchQuery = useDeferredValue(searchQuery);
	const typeTab = initialType ?? "prs";
	const projectFilter = initialProject ?? null;
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

	const buildSearch = useCallback(
		(overrides: {
			search?: string;
			type?: WorkItemTab;
			project?: string | null;
		}): TasksSearch => ({
			search: (overrides.search ?? searchQuery) || undefined,
			type: overrides.type ?? typeTab,
			project: overrides.project ?? projectFilter ?? undefined,
		}),
		[projectFilter, searchQuery, typeTab],
	);
	const syncSearchToUrl = useCallback(
		(query: string) => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
			debounceRef.current = setTimeout(() => {
				navigate({
					to: "/tasks",
					search: buildSearch({ search: query }),
					replace: true,
				});
			}, 300);
		},
		[buildSearch, navigate],
	);
	useEffect(
		() => () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		},
		[],
	);

	const { projects } = useWorkspaceCatalog();
	const projectOptions = useMemo(
		() => projects.map((project) => ({ id: project.id })),
		[projects],
	);
	useEffect(() => {
		if (projectFilter && projectOptions.some((p) => p.id === projectFilter)) {
			return;
		}
		const firstProject = projectOptions[0];
		if (!firstProject) return;
		navigate({
			to: "/tasks",
			search: buildSearch({ project: firstProject.id }),
			replace: true,
		});
	}, [buildSearch, navigate, projectFilter, projectOptions]);

	const [selectedIssues, setSelectedIssues] = useState<SelectedIssue[]>([]);
	const clearIssueSelectionRef = useRef<(() => void) | null>(null);
	const handleIssueSelectionChange = useCallback(
		(issues: SelectedIssue[], clearSelection: () => void) => {
			setSelectedIssues(issues);
			clearIssueSelectionRef.current = clearSelection;
		},
		[],
	);

	return (
		<div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
			<TasksTopBar
				searchQuery={searchQuery}
				onSearchChange={(query) => {
					setSearchQuery(query);
					syncSearchToUrl(query);
				}}
				selectedIssues={selectedIssues}
				onClearIssueSelection={() => clearIssueSelectionRef.current?.()}
				typeTab={typeTab}
				onTypeTabChange={(type) =>
					navigate({
						to: "/tasks",
						search: buildSearch({ type }),
						replace: true,
					})
				}
				projectFilter={projectFilter}
				onProjectFilterChange={(project) =>
					navigate({
						to: "/tasks",
						search: buildSearch({ project }),
						replace: true,
					})
				}
			/>
			<div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
				{typeTab === "prs" ? (
					<PullRequestsContent
						projectFilter={projectFilter}
						searchQuery={deferredSearchQuery}
					/>
				) : (
					<GitHubIssuesContent
						projectFilter={projectFilter}
						searchQuery={deferredSearchQuery}
						onSelectionChange={handleIssueSelectionChange}
					/>
				)}
			</div>
		</div>
	);
}
