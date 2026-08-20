import type { DelegationProfile } from "@superset/host-service/settings";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
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
import { Textarea } from "@superset/ui/textarea";
import {
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { AgentSelect } from "renderer/components/AgentSelect";
import { useAgentConfigs } from "renderer/hooks/useAgentConfigs";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useAutomationAgentChoices } from "renderer/routes/_local/_dashboard/automations/hooks/useAutomationAgentChoices";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { toDelegatedExecutionAgentChoices } from "./delegated-execution-agents";

const PROFILES_QUERY_KEY = ["host-delegation-profiles"] as const;
type ProfileDraft = DelegationProfile;

function profileDraftsEqual(
	left: readonly ProfileDraft[],
	right: readonly ProfileDraft[],
) {
	return JSON.stringify(left) === JSON.stringify(right);
}

function createProfileDraft(order: number): ProfileDraft {
	return {
		id: crypto.randomUUID(),
		name: "New profile",
		description: "",
		instructions: null,
		enabled: false,
		order,
		executorAgentConfigId: null,
		executorModelId: null,
	};
}

export function DelegatedExecutionSetting() {
	const { t } = useTranslation();
	const { activeHostUrl } = useLocalHostService();
	const activeHostUrlRef = useRef(activeHostUrl);
	activeHostUrlRef.current = activeHostUrl;
	const queryClient = useQueryClient();
	const agentConfigsQuery = useAgentConfigs(activeHostUrl);
	const { agents: allPinnedAgents, isFetched: pinnedAgentsFetched } =
		useAutomationAgentChoices(activeHostUrl);
	const eligibleAgents = toDelegatedExecutionAgentChoices(
		allPinnedAgents,
		agentConfigsQuery.data ?? [],
	);
	const profilesQuery = useQuery({
		queryKey: [...PROFILES_QUERY_KEY, activeHostUrl],
		enabled: activeHostUrl !== null,
		queryFn: () => {
			if (!activeHostUrl) throw new Error("Host service is unavailable");
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.delegatedExecution.profiles.query();
		},
	});
	const [editor, setEditor] = useState<{
		hostUrl: string | null;
		baseline: ProfileDraft[] | null;
		draft: ProfileDraft[];
	}>({ hostUrl: activeHostUrl, baseline: null, draft: [] });

	useEffect(() => {
		setEditor((current) =>
			current.hostUrl === activeHostUrl
				? current
				: { hostUrl: activeHostUrl, baseline: null, draft: [] },
		);
	}, [activeHostUrl]);

	useEffect(() => {
		if (!profilesQuery.data || !activeHostUrl) return;
		const incoming = profilesQuery.data.profiles.map((profile) => ({
			...profile,
		}));
		setEditor((current) => {
			if (current.hostUrl !== activeHostUrl) return current;
			if (
				current.baseline !== null &&
				!profileDraftsEqual(current.draft, current.baseline)
			) {
				return current;
			}
			return { ...current, baseline: incoming, draft: incoming };
		});
	}, [activeHostUrl, profilesQuery.data]);

	const profiles = editor.draft;
	const modelQueries = useQueries({
		queries: profiles.map((profile) => ({
			queryKey: [
				"host-delegation-profile-models",
				activeHostUrl,
				profile.executorAgentConfigId,
			],
			enabled: activeHostUrl !== null && profile.executorAgentConfigId !== null,
			queryFn: () => {
				if (!activeHostUrl || !profile.executorAgentConfigId) {
					throw new Error("Host service or agent is unavailable");
				}
				return getHostServiceClientByUrl(
					activeHostUrl,
				).settings.delegatedExecution.models.query({
					executorAgentConfigId: profile.executorAgentConfigId,
				});
			},
		})),
	});

	const saveMutation = useMutation({
		mutationFn: ({
			hostUrl,
			submitted,
		}: {
			hostUrl: string;
			submitted: ProfileDraft[];
		}) =>
			getHostServiceClientByUrl(
				hostUrl,
			).settings.delegatedExecution.setProfiles.mutate(submitted),
		onSuccess: (saved, request) => {
			queryClient.setQueryData([...PROFILES_QUERY_KEY, request.hostUrl], saved);
			const savedProfiles = saved.profiles.map((profile) => ({ ...profile }));
			setEditor((current) =>
				activeHostUrlRef.current === request.hostUrl &&
				current.hostUrl === request.hostUrl &&
				profileDraftsEqual(current.draft, request.submitted)
					? { ...current, baseline: savedProfiles, draft: savedProfiles }
					: current,
			);
			toast.success(t("delegatedExecution.profilesSaved"));
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: t("delegatedExecution.profilesSaveFailed"),
			);
		},
	});

	const updateProfiles = (
		update: (current: ProfileDraft[]) => ProfileDraft[],
	) => {
		setEditor((current) => ({
			...current,
			draft: update(current.draft).map((profile, order) => ({
				...profile,
				order,
			})),
		}));
	};
	const updateProfile = (index: number, patch: Partial<ProfileDraft>) =>
		updateProfiles((current) =>
			current.map((profile, profileIndex) =>
				profileIndex === index ? { ...profile, ...patch } : profile,
			),
		);
	const moveProfile = (index: number, offset: -1 | 1) =>
		updateProfiles((current) => {
			const target = index + offset;
			if (target < 0 || target >= current.length) return current;
			const next = [...current];
			[next[index], next[target]] = [next[target], next[index]];
			return next;
		});

	const loading =
		profilesQuery.isLoading ||
		agentConfigsQuery.isLoading ||
		!pinnedAgentsFetched ||
		editor.hostUrl !== activeHostUrl ||
		editor.baseline === null;
	const locked = loading || saveMutation.isPending || activeHostUrl === null;
	const dirty =
		editor.baseline !== null && !profileDraftsEqual(profiles, editor.baseline);
	const canSave = profiles.every(
		(profile) =>
			profile.name.trim().length > 0 &&
			(!profile.enabled ||
				(profile.executorAgentConfigId !== null &&
					profile.executorModelId !== null)),
	);

	return (
		<div className="space-y-4">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">
					{t("delegatedExecution.title")}
				</Label>
				<p className="text-xs text-fg-mute max-w-xl leading-relaxed">
					{t("delegatedExecution.profilesDescription")}
				</p>
			</div>

			{profiles.map((profile, index) => {
				const modelsQuery = modelQueries[index];
				const models = modelsQuery?.data?.models ?? [];
				return (
					<div key={profile.id} className="space-y-4 rounded-md border p-4">
						<div className="flex items-start justify-between gap-4">
							<div className="min-w-0 flex-1 space-y-2">
								<Label htmlFor={`delegation-profile-name-${profile.id}`}>
									{t("delegatedExecution.profileName")}
								</Label>
								<Input
									id={`delegation-profile-name-${profile.id}`}
									value={profile.name}
									disabled={locked}
									onChange={(event) =>
										updateProfile(index, { name: event.target.value })
									}
								/>
							</div>
							<div className="flex items-center gap-2 pt-7">
								<Label
									htmlFor={`delegation-profile-enabled-${profile.id}`}
									className="text-xs text-fg-mute"
								>
									{t("delegatedExecution.profileEnabled")}
								</Label>
								<Switch
									id={`delegation-profile-enabled-${profile.id}`}
									checked={profile.enabled}
									disabled={locked}
									onCheckedChange={(enabled) =>
										updateProfile(index, { enabled })
									}
								/>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={locked || index === 0}
									onClick={() => moveProfile(index, -1)}
								>
									{t("delegatedExecution.moveUp")}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={locked || index === profiles.length - 1}
									onClick={() => moveProfile(index, 1)}
								>
									{t("delegatedExecution.moveDown")}
								</Button>
								<Button
									type="button"
									size="sm"
									variant="destructive"
									disabled={locked}
									onClick={() =>
										updateProfiles((current) =>
											current.filter(
												(_, profileIndex) => profileIndex !== index,
											),
										)
									}
								>
									{t("common.delete")}
								</Button>
							</div>
						</div>

						<div className="space-y-2">
							<Label htmlFor={`delegation-profile-description-${profile.id}`}>
								{t("delegatedExecution.profileDescription")}
							</Label>
							<Input
								id={`delegation-profile-description-${profile.id}`}
								value={profile.description}
								disabled={locked}
								onChange={(event) =>
									updateProfile(index, { description: event.target.value })
								}
							/>
							<p className="text-xs text-fg-mute">
								{t("delegatedExecution.profileDescriptionHint")}
							</p>
						</div>

						<div className="space-y-2">
							<Label htmlFor={`delegation-profile-instructions-${profile.id}`}>
								{t("delegatedExecution.profileInstructions")}
							</Label>
							<Textarea
								id={`delegation-profile-instructions-${profile.id}`}
								value={profile.instructions ?? ""}
								disabled={locked}
								onChange={(event) =>
									updateProfile(index, {
										instructions: event.target.value || null,
									})
								}
							/>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label>{t("delegatedExecution.agent")}</Label>
								<AgentSelect
									agents={eligibleAgents}
									value={profile.executorAgentConfigId ?? ""}
									placeholder={t("delegatedExecution.agentPlaceholder")}
									disabled={locked}
									triggerClassName="w-full"
									onValueChange={(executorAgentConfigId) =>
										updateProfile(index, {
											executorAgentConfigId,
											executorModelId: null,
										})
									}
								/>
							</div>
							<div className="space-y-2">
								<Label>{t("delegatedExecution.model")}</Label>
								<Select
									value={profile.executorModelId ?? ""}
									onValueChange={(executorModelId) =>
										updateProfile(index, { executorModelId })
									}
									disabled={
										locked ||
										!profile.executorAgentConfigId ||
										modelsQuery?.isLoading ||
										modelsQuery?.isError ||
										models.length === 0
									}
								>
									<SelectTrigger className="w-full">
										<SelectValue
											placeholder={
												modelsQuery?.isLoading
													? t("delegatedExecution.modelLoading")
													: t("delegatedExecution.modelPlaceholder")
											}
										/>
									</SelectTrigger>
									<SelectContent>
										{models.map((model) => (
											<SelectItem key={model.id} value={model.id}>
												{model.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{profile.executorAgentConfigId && modelsQuery?.isError ? (
									<p className="text-xs text-destructive">
										{t("delegatedExecution.modelsLoadFailed")}
									</p>
								) : profile.executorAgentConfigId &&
									!modelsQuery?.isLoading &&
									models.length === 0 ? (
									<p className="text-xs text-destructive">
										{t("delegatedExecution.noModels")}
									</p>
								) : null}
							</div>
						</div>
					</div>
				);
			})}

			{activeHostUrl === null ? (
				<p className="text-xs text-destructive select-text cursor-text">
					{t("delegatedExecution.hostUnavailable")}
				</p>
			) : profilesQuery.isError ? (
				<p className="text-xs text-destructive select-text cursor-text">
					{t("delegatedExecution.profilesLoadFailed")}
				</p>
			) : null}

			<div className="flex justify-between gap-3">
				<Button
					type="button"
					size="sm"
					variant="outline"
					disabled={locked}
					onClick={() =>
						updateProfiles((current) => [
							...current,
							createProfileDraft(current.length),
						])
					}
				>
					{t("delegatedExecution.addProfile")}
				</Button>
				<Button
					size="sm"
					disabled={!dirty || !canSave || locked}
					onClick={() => {
						if (!activeHostUrl) return;
						saveMutation.mutate({
							hostUrl: activeHostUrl,
							submitted: profiles.map((profile, order) => ({
								...profile,
								order,
							})),
						});
					}}
				>
					{saveMutation.isPending ? t("common.saving") : t("common.save")}
				</Button>
			</div>
		</div>
	);
}
