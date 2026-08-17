import type { DelegatedExecutionSettings } from "@superset/host-service/settings";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AgentSelect } from "renderer/components/AgentSelect";
import { useAgentConfigs } from "renderer/hooks/useAgentConfigs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useAutomationAgentChoices } from "renderer/routes/_local/_dashboard/automations/hooks/useAutomationAgentChoices";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { toDelegatedExecutionAgentChoices } from "./delegated-execution-agents";
import {
	areDelegatedExecutionDraftsEqual,
	canSaveDelegatedExecutionDraft,
	type DelegatedExecutionDraft,
	shouldAdoptDelegatedExecutionQueryData,
	shouldApplyDelegatedExecutionSaveResult,
} from "./delegated-execution-form";

const SETTINGS_QUERY_KEY = ["host-delegated-execution"] as const;

const EMPTY_DRAFT: DelegatedExecutionDraft = {
	enabled: false,
	executorAgentConfigId: null,
	executorModelId: null,
};

interface EditorState {
	hostUrl: string | null;
	baseline: DelegatedExecutionDraft | null;
	draft: DelegatedExecutionDraft;
}

interface SaveRequest {
	hostUrl: string;
	draft: DelegatedExecutionDraft;
}

function toDraft(
	settings: DelegatedExecutionSettings,
): DelegatedExecutionDraft {
	return {
		enabled: settings.enabled,
		executorAgentConfigId: settings.executorAgentConfigId,
		executorModelId: settings.executorModelId,
	};
}

export function DelegatedExecutionSetting() {
	const { t } = useTranslation();
	const { activeHostUrl } = useLocalHostService();
	const agentConfigsQuery = useAgentConfigs(activeHostUrl);
	const { agents: allPinnedAgents, isFetched: pinnedAgentsFetched } =
		useAutomationAgentChoices(activeHostUrl);
	const agentConfigs = agentConfigsQuery.data ?? [];
	const eligibleAgents = toDelegatedExecutionAgentChoices(
		allPinnedAgents,
		agentConfigs,
	);
	const activeHostUrlRef = useRef(activeHostUrl);
	activeHostUrlRef.current = activeHostUrl;
	const queryClient = useQueryClient();
	const settingsQuery = useQuery({
		queryKey: [...SETTINGS_QUERY_KEY, activeHostUrl],
		enabled: activeHostUrl !== null,
		queryFn: () => {
			if (!activeHostUrl) throw new Error("Host service is unavailable");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.delegatedExecution.get.query();
		},
	});
	const [editor, setEditor] = useState<EditorState>({
		hostUrl: activeHostUrl,
		baseline: null,
		draft: EMPTY_DRAFT,
	});
	const draft = editor.draft;
	const modelsQuery = useQuery({
		queryKey: [
			"host-delegated-execution-models",
			activeHostUrl,
			draft.executorAgentConfigId,
		],
		enabled: activeHostUrl !== null && draft.executorAgentConfigId !== null,
		queryFn: () => {
			if (!activeHostUrl || !draft.executorAgentConfigId) {
				throw new Error("Host service or agent is unavailable");
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.delegatedExecution.models.query({
				executorAgentConfigId: draft.executorAgentConfigId,
			});
		},
	});
	const selectedModels = modelsQuery.data?.models ?? [];

	useEffect(() => {
		setEditor((current) =>
			current.hostUrl === activeHostUrl
				? current
				: {
						hostUrl: activeHostUrl,
						baseline: null,
						draft: EMPTY_DRAFT,
					},
		);
	}, [activeHostUrl]);

	useEffect(() => {
		if (!settingsQuery.data || !activeHostUrl) return;
		const incoming = toDraft(settingsQuery.data);
		setEditor((current) => {
			if (current.hostUrl !== activeHostUrl) return current;
			if (
				!shouldAdoptDelegatedExecutionQueryData(current.draft, current.baseline)
			) {
				return current;
			}
			return { ...current, baseline: incoming, draft: incoming };
		});
	}, [activeHostUrl, settingsQuery.data]);

	const saveMutation = useMutation({
		mutationFn: ({ hostUrl, draft: submittedDraft }: SaveRequest) =>
			getHostServiceClientByUrl(hostUrl).settings.delegatedExecution.set.mutate(
				submittedDraft,
			),
		onSuccess: (saved, request) => {
			queryClient.setQueryData([...SETTINGS_QUERY_KEY, request.hostUrl], saved);
			const savedDraft = toDraft(saved);
			setEditor((current) =>
				shouldApplyDelegatedExecutionSaveResult({
					currentHostUrl: activeHostUrlRef.current,
					requestHostUrl: request.hostUrl,
					currentDraft: current.draft,
					submittedDraft: request.draft,
				}) && current.hostUrl === request.hostUrl
					? { ...current, baseline: savedDraft, draft: savedDraft }
					: current,
			);
			toast.success(t("delegatedExecution.saved"));
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: t("delegatedExecution.saveFailed"),
			);
		},
	});

	const dirty =
		editor.baseline !== null &&
		!areDelegatedExecutionDraftsEqual(draft, editor.baseline);
	const canSave = canSaveDelegatedExecutionDraft(draft, true);
	const loading =
		settingsQuery.isLoading ||
		agentConfigsQuery.isLoading ||
		!pinnedAgentsFetched ||
		editor.hostUrl !== activeHostUrl ||
		editor.baseline === null;
	const controlsLocked =
		loading || saveMutation.isPending || activeHostUrl === null;

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-10">
				<div className="space-y-0.5">
					<Label
						htmlFor="delegated-execution-enabled"
						className="text-sm font-medium"
					>
						{t("delegatedExecution.title")}
					</Label>
					<p className="text-xs text-fg-mute max-w-xl leading-relaxed">
						{t("delegatedExecution.description")}
					</p>
				</div>
				<Switch
					id="delegated-execution-enabled"
					checked={draft.enabled}
					onCheckedChange={(enabled) =>
						setEditor((current) => ({
							...current,
							draft: { ...current.draft, enabled },
						}))
					}
					disabled={controlsLocked}
				/>
			</div>

			<div className="grid gap-4 sm:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor="delegated-execution-agent">
						{t("delegatedExecution.agent")}
					</Label>
					<AgentSelect
						agents={eligibleAgents}
						value={draft.executorAgentConfigId ?? ""}
						placeholder={t("delegatedExecution.agentPlaceholder")}
						disabled={controlsLocked}
						triggerClassName="w-full"
						onValueChange={(executorAgentConfigId) =>
							setEditor((current) => ({
								...current,
								draft: {
									...current.draft,
									executorAgentConfigId,
									executorModelId: null,
								},
							}))
						}
					/>
					<p className="text-xs text-fg-mute">
						{t("delegatedExecution.agentHint")}
					</p>
				</div>
				<div className="space-y-2">
					<Label htmlFor="delegated-execution-model">
						{t("delegatedExecution.model")}
					</Label>
					<Select
						value={draft.executorModelId ?? ""}
						onValueChange={(executorModelId) =>
							setEditor((current) => ({
								...current,
								draft: { ...current.draft, executorModelId },
							}))
						}
						disabled={
							controlsLocked ||
							!draft.executorAgentConfigId ||
							modelsQuery.isLoading ||
							modelsQuery.isError ||
							selectedModels.length === 0
						}
					>
						<SelectTrigger id="delegated-execution-model" className="w-full">
							<SelectValue
								placeholder={
									modelsQuery.isLoading
										? t("delegatedExecution.modelLoading")
										: t("delegatedExecution.modelPlaceholder")
								}
							/>
						</SelectTrigger>
						<SelectContent>
							{selectedModels.map((model) => (
								<SelectItem key={model.id} value={model.id}>
									{model.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{draft.executorAgentConfigId && modelsQuery.isError ? (
						<p className="text-xs text-destructive">
							{t("delegatedExecution.modelsLoadFailed")}
						</p>
					) : draft.executorAgentConfigId &&
						!modelsQuery.isLoading &&
						!modelsQuery.isError &&
						selectedModels.length === 0 ? (
						<p className="text-xs text-destructive">
							{t("delegatedExecution.noModels")}
						</p>
					) : null}
				</div>
			</div>

			{activeHostUrl === null ? (
				<p className="text-xs text-destructive select-text cursor-text">
					{t("delegatedExecution.hostUnavailable")}
				</p>
			) : settingsQuery.isError ? (
				<p className="text-xs text-destructive select-text cursor-text">
					{t("delegatedExecution.loadFailed")}
				</p>
			) : null}

			<div className="flex justify-end">
				<Button
					size="sm"
					onClick={() => {
						if (!activeHostUrl) return;
						saveMutation.mutate({
							hostUrl: activeHostUrl,
							draft: { ...draft },
						});
					}}
					disabled={!dirty || !canSave || controlsLocked}
				>
					{saveMutation.isPending ? t("common.saving") : t("common.save")}
				</Button>
			</div>
		</div>
	);
}
