import { Checkbox } from "@superset/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { useQuery } from "@tanstack/react-query";
import type React from "react";
import type { RefObject } from "react";
import { useId, useMemo, useState } from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	PRIcon,
	type PRState,
} from "renderer/screens/main/components/PRIcon/PRIcon";

export interface SelectedPR {
	prNumber: number;
	title: string;
	url: string;
	state: string;
}

interface PRLinkCommandProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSelect: (pr: SelectedPR) => void;
	projectId: string | null;
	githubOwner: string | null;
	repoName: string | null;
	anchorRef: RefObject<HTMLElement | null>;
}

function parseGitHubPullRequestUrl(query: string): {
	owner: string;
	repo: string;
	prNumber: string;
} | null {
	const match = query.match(
		/^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)(?:[/?#].*)?$/i,
	);

	if (!match) return null;

	return {
		owner: match[1],
		repo: match[2],
		prNumber: match[3],
	};
}

export function PRLinkCommand({
	open,
	onOpenChange,
	onSelect,
	projectId,
	githubOwner,
	repoName,
	anchorRef,
}: PRLinkCommandProps) {
	const { t } = useTranslation();
	const { activeHostUrl } = useLocalHostService();
	const [searchQuery, setSearchQuery] = useState("");
	const [showClosed, setShowClosed] = useState(false);
	const showClosedId = useId();
	const debouncedQuery = useDebouncedValue(searchQuery, 300);
	const trimmedQuery = searchQuery.trim(); // Immediate trim for UI decisions
	const debouncedTrimmed = debouncedQuery.trim(); // Debounced trim for RPC calls

	// Detect if we're in the pending debounce state
	const isPendingDebounce = trimmedQuery !== debouncedTrimmed;

	const parsedPullRequestUrl = useMemo(() => {
		return parseGitHubPullRequestUrl(debouncedTrimmed);
	}, [debouncedTrimmed]);

	const selectedRepositoryLabel = useMemo(() => {
		if (!githubOwner || !repoName) return null;
		return `${githubOwner}/${repoName}`;
	}, [githubOwner, repoName]);

	const pastedRepository = useMemo(() => {
		if (!parsedPullRequestUrl) return null;
		return `${parsedPullRequestUrl.owner}/${parsedPullRequestUrl.repo}`.toLowerCase();
	}, [parsedPullRequestUrl]);

	const isCrossRepositoryUrl = Boolean(
		selectedRepositoryLabel &&
			pastedRepository &&
			pastedRepository !== selectedRepositoryLabel.toLowerCase(),
	);

	// Search by PR number when the pasted URL matches the selected repository.
	const effectiveQuery = parsedPullRequestUrl
		? isCrossRepositoryUrl
			? ""
			: parsedPullRequestUrl.prNumber
		: debouncedTrimmed;

	const { data, isFetching, error } = useQuery({
		queryKey: [
			"workspaceCreation",
			"searchPullRequests",
			projectId,
			activeHostUrl,
			effectiveQuery,
			showClosed,
		],
		queryFn: async () => {
			if (!activeHostUrl || !projectId) return null;
			return getHostServiceClientByUrl(
				activeHostUrl,
			).workspaceCreation.searchPullRequests.query({
				projectId,
				query: effectiveQuery || undefined,
				limit: 30,
				includeClosed: showClosed,
			});
		},
		enabled: !!projectId && !!activeHostUrl && open && !isCrossRepositoryUrl,
		retry: false,
	});

	const pullRequests = useMemo(() => {
		if (isCrossRepositoryUrl) {
			return [];
		}
		return data?.pullRequests ?? [];
	}, [data?.pullRequests, isCrossRepositoryUrl]);

	const isLoading = isCrossRepositoryUrl
		? false
		: isFetching || isPendingDebounce;
	const repoMismatch = data?.repoMismatch ?? null;

	const handleClose = () => {
		setSearchQuery("");
		onOpenChange(false);
	};

	const handleSelect = (pr: (typeof pullRequests)[number]) => {
		onSelect({
			prNumber: pr.prNumber,
			title: pr.title,
			url: pr.url,
			state: pr.state,
		});
		handleClose();
	};

	return (
		<Popover open={open}>
			<PopoverAnchor virtualRef={anchorRef as React.RefObject<Element>} />
			<PopoverContent
				className="w-80 p-0"
				align="start"
				side="bottom"
				onWheel={(event) => event.stopPropagation()}
				onPointerDownOutside={handleClose}
				onEscapeKeyDown={handleClose}
				onFocusOutside={(e) => e.preventDefault()}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder={t("workspace.searchPullRequests")}
						value={searchQuery}
						onValueChange={setSearchQuery}
					/>
					<div className="flex items-center gap-2 border-b px-3 py-2">
						<Checkbox
							id={showClosedId}
							checked={showClosed}
							onCheckedChange={(checked) => setShowClosed(checked === true)}
						/>
						<label
							htmlFor={showClosedId}
							className="cursor-pointer select-none text-xs text-fg-mute"
						>
							{t("workspace.showClosed")}
						</label>
					</div>
					<CommandList className="max-h-[280px]">
						{pullRequests.length === 0 && (
							<CommandEmpty>
								{isLoading
									? debouncedTrimmed
										? t("workspace.searching")
										: t("workspace.loadingPullRequests")
									: error instanceof Error
										? error.message
										: repoMismatch
											? t("workspace.prRepoMismatch", {
													repository: repoMismatch,
												})
											: isCrossRepositoryUrl
												? t("workspace.prRepoMismatch", {
														repository: selectedRepositoryLabel ?? "",
													})
												: debouncedTrimmed
													? t("workspace.noPullRequests")
													: showClosed
														? t("workspace.noPullRequests")
														: t("workspace.noOpenPullRequests")}
							</CommandEmpty>
						)}
						{pullRequests.length > 0 && (
							<CommandGroup
								heading={
									debouncedTrimmed
										? t("workspace.resultCount", {
												count: pullRequests.length,
											})
										: showClosed
											? t("workspace.recentPullRequests")
											: t("workspace.openPullRequests")
								}
							>
								{pullRequests.map((pr) => (
									<CommandItem
										key={pr.prNumber}
										value={`${pr.prNumber}-${pr.title}`}
										onSelect={() => handleSelect(pr)}
										className="group"
									>
										<PRIcon
											state={pr.state as PRState}
											className="size-3.5 shrink-0"
										/>
										<span className="shrink-0 font-mono text-xs text-fg-mute">
											#{pr.prNumber}
										</span>
										<span className="min-w-0 flex-1 truncate text-xs">
											{pr.title}
										</span>
										<span className="shrink-0 hidden text-xs text-fg-mute group-data-[selected=true]:inline">
											{t("workspace.linkAction")} ↵
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
