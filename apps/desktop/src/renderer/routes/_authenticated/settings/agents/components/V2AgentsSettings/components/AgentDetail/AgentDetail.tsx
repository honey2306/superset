import type { HostAgentConfig } from "@superset/host-service/settings";
import type { PromptTransport } from "@superset/shared/agent-prompt-launch";
import { getPresetById } from "@superset/shared/host-agent-presets";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
	getAgentCommandText,
	isAgentCommandPatchChanged,
	parseAgentCommandText,
} from "renderer/lib/agent-launch-command";
import { joinArgs, parseArgs } from "renderer/lib/argv";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	AgentDetailHeader,
	AgentLaunchFields,
	Section,
} from "../AgentFormControls";
import { AgentIconPicker } from "../AgentIconPicker";

interface AgentDetailProps {
	config: HostAgentConfig;
	description: string;
	onChanged: (updated: HostAgentConfig) => void;
	onDeleted: () => void;
}

export function AgentDetail({
	config,
	description,
	onChanged,
	onDeleted,
}: AgentDetailProps) {
	const { t } = useTranslation();
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const isCustom = config.presetId === "custom";
	const hasBundledDefault = getPresetById(config.presetId) !== undefined;

	const [label, setLabel] = useState(config.label);
	const [commandText, setCommandText] = useState(getAgentCommandText(config));
	const [promptArgsText, setPromptArgsText] = useState(
		joinArgs(config.promptArgs),
	);
	const [promptTransport, setPromptTransport] = useState<PromptTransport>(
		config.promptTransport,
	);

	useEffect(() => {
		setLabel(config.label);
		setCommandText(
			getAgentCommandText({
				command: config.command,
				args: config.args,
				env: config.env,
			}),
		);
		setPromptArgsText(joinArgs(config.promptArgs));
		setPromptTransport(config.promptTransport);
	}, [
		config.label,
		config.command,
		config.args,
		config.env,
		config.promptArgs,
		config.promptTransport,
	]);

	const updateMutation = useMutation({
		mutationFn: (
			patch: Parameters<
				ReturnType<
					typeof getHostServiceClientByUrl
				>["settings"]["agentConfigs"]["update"]["mutate"]
			>[0]["patch"],
		) => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, t, {
						action: t("agents.saveAgentAction"),
					}),
				);
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.update.mutate({ id: config.id, patch });
		},
		onSuccess: (updated) => onChanged(updated),
		onError: (err) =>
			toast.error(err instanceof Error ? err.message : t("agents.failedSave")),
	});

	const removeMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, t, {
						action: t("agents.removeAgentAction"),
					}),
				);
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.remove.mutate({ id: config.id });
		},
		onSuccess: () => onDeleted(),
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : t("agents.failedRemove"),
			),
	});

	const restoreDefaultMutation = useMutation({
		mutationFn: () => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostService, t, {
						action: t("agents.restoreAgentDefaultsAction"),
					}),
				);
			}
			return getHostServiceClientByUrl(
				activeHostUrl,
			).settings.agentConfigs.restoreDefault.mutate({ id: config.id });
		},
		onSuccess: (updated) => {
			onChanged(updated);
			toast.success(t("agents.restored", { name: updated.label }));
		},
		onError: (err) =>
			toast.error(
				err instanceof Error ? err.message : t("agents.failedRestore"),
			),
	});

	const handleLabelBlur = () => {
		if (label !== config.label && label.trim().length > 0) {
			updateMutation.mutate({ label });
		}
	};

	const handleCommandBlur = () => {
		const patch = parseAgentCommandText(commandText);
		const { command } = patch;
		if (command.length === 0) {
			toast.error(t("agents.commandRequired"));
			setCommandText(getAgentCommandText(config));
			return;
		}
		if (isAgentCommandPatchChanged(config, patch)) {
			updateMutation.mutate(patch);
		}
	};

	const handlePromptArgsBlur = () => {
		const args = parseArgs(promptArgsText);
		const changed =
			args.length !== config.promptArgs.length ||
			args.some((arg, i) => arg !== config.promptArgs[i]);
		if (changed) updateMutation.mutate({ promptArgs: args });
	};

	const handleTransportChange = (next: PromptTransport) => {
		if (next === promptTransport) return;
		const prev = promptTransport;
		setPromptTransport(next);
		updateMutation.mutate(
			{ promptTransport: next },
			{ onError: () => setPromptTransport(prev) },
		);
	};

	return (
		<div className="p-6 max-w-3xl w-full mx-auto">
			<AgentDetailHeader
				iconId={config.iconId}
				presetId={config.presetId}
				title={config.label}
				subtitle={description}
			/>

			<div className="space-y-6">
				<Section title={t("agents.label")}>
					<Input
						id={`label-${config.id}`}
						value={label}
						onChange={(e) => setLabel(e.target.value)}
						onBlur={handleLabelBlur}
					/>
				</Section>

				{isCustom ? (
					<Section title={t("agents.icon")}>
						<AgentIconPicker
							value={config.iconId}
							onChange={(iconId) => updateMutation.mutate({ iconId })}
							disabled={updateMutation.isPending}
						/>
					</Section>
				) : null}

				<AgentLaunchFields
					idPrefix={config.id}
					commandText={commandText}
					onCommandTextChange={setCommandText}
					onCommandBlur={handleCommandBlur}
					promptArgsText={promptArgsText}
					onPromptArgsTextChange={setPromptArgsText}
					onPromptArgsBlur={handlePromptArgsBlur}
					promptTransport={promptTransport}
					onPromptTransportChange={handleTransportChange}
				/>

				{hasBundledDefault ? (
					<div className="pt-2 border-t border-border">
						<div className="flex items-center justify-between gap-8">
							<div className="min-w-0 flex-1">
								<div className="text-sm font-medium">
									{t("agents.restoreDefault")}
								</div>
								<p className="text-sm text-muted-foreground mt-0.5">
									{t("agents.restoreDefaultDescription")}
								</p>
							</div>
							<AlertDialog>
								<AlertDialogTrigger asChild>
									<Button
										variant="outline"
										size="sm"
										disabled={restoreDefaultMutation.isPending}
										className="shrink-0 gap-1.5"
									>
										<RotateCcw className="size-3.5" />
										{t("agents.restore")}
									</Button>
								</AlertDialogTrigger>
								<AlertDialogContent>
									<AlertDialogHeader>
										<AlertDialogTitle>
											{t("agents.restoreDialogTitle", { name: config.label })}
										</AlertDialogTitle>
										<AlertDialogDescription>
											{t("agents.restoreDialogDescription")}
										</AlertDialogDescription>
									</AlertDialogHeader>
									<AlertDialogFooter>
										<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
										<AlertDialogAction
											onClick={() => restoreDefaultMutation.mutate()}
										>
											{t("agents.restoreDefaults")}
										</AlertDialogAction>
									</AlertDialogFooter>
								</AlertDialogContent>
							</AlertDialog>
						</div>
					</div>
				) : null}

				<div
					className={hasBundledDefault ? "pt-6" : "pt-2 border-t border-border"}
				>
					<div className="flex items-center justify-between gap-8">
						<div className="min-w-0 flex-1">
							<div className="text-sm font-medium">{t("agents.delete")}</div>
							<p className="text-sm text-muted-foreground mt-0.5">
								{t("agents.deleteDescription")}
							</p>
						</div>
						<Button
							variant="destructive"
							size="sm"
							onClick={() => removeMutation.mutate()}
							disabled={removeMutation.isPending}
							className="shrink-0 gap-1.5"
						>
							<Trash2 className="size-3.5" />
							{t("common.delete")}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
