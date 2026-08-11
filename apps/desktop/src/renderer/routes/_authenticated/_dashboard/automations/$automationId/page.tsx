import { alert } from "@superset/ui/atoms/Alert";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	type LocalAutomation,
	type LocalAutomationRun,
	localAutomationKeys,
} from "renderer/routes/_authenticated/_dashboard/hooks/useLocalAutomationData";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { getAutomationRunDestination } from "../utils/getAutomationRunDestination";
import { AutomationBody } from "./components/AutomationBody";
import { AutomationDetailHeader } from "./components/AutomationDetailHeader";
import { AutomationDetailSidebar } from "./components/AutomationDetailSidebar";
import { VersionHistorySheet } from "./components/VersionHistorySheet";

type AutomationDetailSearch = {
	history?: boolean;
};

export const Route = createFileRoute(
	"/_authenticated/_dashboard/automations/$automationId/",
)({
	component: AutomationDetailPage,
	validateSearch: (
		search: Record<string, unknown>,
	): AutomationDetailSearch => ({
		history: search.history === true,
	}),
});

const RECENT_RUNS_LIMIT = 10;

function AutomationDetailPage() {
	const { automationId } = Route.useParams();
	const { history } = Route.useSearch();
	const navigate = useNavigate();
	const hostUrl = useHostUrl(null);
	const queryClient = useQueryClient();
	const [historyOpen, setHistoryOpen] = useState(history ?? false);

	const { data: automation, isPending: automationLoading } = useQuery({
		queryKey: localAutomationKeys.automation(hostUrl, automationId),
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return undefined as LocalAutomation | undefined;
			return getHostServiceClientByUrl(hostUrl).automations.get.query({
				id: automationId,
			});
		},
	});
	const { data: recentRuns = [] } = useQuery({
		queryKey: localAutomationKeys.runs(hostUrl, automationId),
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] as LocalAutomationRun[];
			return getHostServiceClientByUrl(hostUrl).automations.listRuns.query({
				automationId,
				limit: RECENT_RUNS_LIMIT,
			});
		},
		refetchInterval: 5_000,
	});
	const invalidateAutomation = () => {
		queryClient.invalidateQueries({
			queryKey: localAutomationKeys.automation(hostUrl, automationId),
		});
		queryClient.invalidateQueries({
			queryKey: localAutomationKeys.automations(hostUrl),
		});
		queryClient.invalidateQueries({
			queryKey: localAutomationKeys.runs(hostUrl, automationId),
		});
	};
	const openRun = (run: LocalAutomationRun) => {
		const destination = getAutomationRunDestination(run);
		if ("reason" in destination) {
			toast.error(destination.reason);
			return;
		}
		void navigateToWorkspace(destination.workspaceId, navigate, {
			search: {
				terminalId: destination.terminalId,
				focusRequestId: crypto.randomUUID(),
			},
		});
	};

	const setEnabledMutation = useMutation({
		mutationFn: (enabled: boolean) =>
			(() => {
				if (!hostUrl) throw new Error("Local host service is unavailable");
				return getHostServiceClientByUrl(hostUrl).automations.setEnabled.mutate(
					{ id: automationId, enabled },
				);
			})(),
		onSuccess: invalidateAutomation,
	});

	const runNowMutation = useMutation({
		mutationFn: () =>
			(() => {
				if (!hostUrl) throw new Error("Local host service is unavailable");
				return getHostServiceClientByUrl(hostUrl).automations.runNow.mutate({
					id: automationId,
				});
			})(),
		onMutate: () => {
			const toastId = `automation-run-now-${automationId}`;
			toast.loading("Starting automation...", { id: toastId });
			return { toastId };
		},
		onSuccess: (result, _variables, context) => {
			invalidateAutomation();
			toast.dismiss(context?.toastId);
			const destination = getAutomationRunDestination({
				v2WorkspaceId: result.workspaceId,
				sessionKind: result.sessionKind,
				terminalSessionId:
					result.sessionKind === "terminal" ? result.sessionId : null,
			});
			if ("reason" in destination) {
				toast.success("Running now");
				toast.message(destination.reason);
				return;
			}
			void navigateToWorkspace(destination.workspaceId, navigate, {
				search: {
					terminalId: destination.terminalId,
					focusRequestId: crypto.randomUUID(),
				},
			});
		},
		onError: (error, _variables, context) => {
			toast.dismiss(context?.toastId);
			toast.error(
				error instanceof Error ? error.message : "Failed to trigger run",
			);
		},
	});

	const deleteMutation = useMutation({
		mutationFn: () =>
			(() => {
				if (!hostUrl) throw new Error("Local host service is unavailable");
				return getHostServiceClientByUrl(hostUrl).automations.delete.mutate({
					id: automationId,
				});
			})(),
		onSuccess: () => navigate({ to: "/automations" }),
	});

	if (!automation) {
		if (automationLoading) return null;
		return (
			<div className="flex h-full w-full items-center justify-center text-sm text-fg-mute select-text cursor-text">
				Automation not found.
			</div>
		);
	}

	return (
		<div className="flex h-full w-full flex-1 overflow-hidden">
			<div className="flex flex-1 flex-col overflow-hidden">
				<AutomationDetailHeader
					name={automation.name}
					enabled={automation.enabled}
					onBack={() => navigate({ to: "/automations" })}
					onToggleEnabled={() => setEnabledMutation.mutate(!automation.enabled)}
					onDelete={() => {
						alert({
							title: "Delete automation?",
							description: `"${automation.name}" will stop firing and its run history will be removed. This can't be undone.`,
							actions: [
								{ label: "Cancel", variant: "outline", onClick: () => {} },
								{
									label: "Delete",
									variant: "destructive",
									onClick: () => {
										toast.promise(deleteMutation.mutateAsync(), {
											loading: "Deleting automation...",
											success: `"${automation.name}" deleted`,
											error: (err) =>
												err instanceof Error
													? err.message
													: "Failed to delete automation",
										});
									},
								},
							],
						});
					}}
					onRunNow={() => runNowMutation.mutate()}
					onOpenHistory={() => setHistoryOpen(true)}
					toggleDisabled={setEnabledMutation.isPending}
					deleteDisabled={deleteMutation.isPending}
					runNowDisabled={runNowMutation.isPending}
				/>

				<AutomationBody key={automation.id} automation={automation} />
			</div>

			<AutomationDetailSidebar
				automation={automation}
				recentRuns={recentRuns}
				onOpenRun={openRun}
			/>

			<VersionHistorySheet
				key={automation.id}
				automationId={automation.id}
				automationName={automation.name}
				currentPrompt={automation.prompt}
				open={historyOpen}
				onOpenChange={setHistoryOpen}
			/>
		</div>
	);
}
