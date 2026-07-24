import type { ResolvedAgentConfig } from "@superset/shared/agent-settings";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Textarea } from "@superset/ui/textarea";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { AgentEditableField } from "../../agent-card.types";

interface AgentCardFieldsProps {
	preset: ResolvedAgentConfig;
	inputVersion: number;
	showCommands: boolean;
	showTaskPrompts: boolean;
	validationMessage: string | null;
	onFieldBlur: (field: AgentEditableField, value: string) => void;
}

export function AgentCardFields({
	preset,
	inputVersion,
	showCommands,
	showTaskPrompts,
	validationMessage,
	onFieldBlur,
}: AgentCardFieldsProps) {
	const { t } = useTranslation();
	return (
		<>
			<div className="grid gap-4 md:grid-cols-2">
				<div className="space-y-2">
					<Label htmlFor={`${preset.id}-label`}>{t("agents.label")}</Label>
					<Input
						key={`${preset.id}-${inputVersion}-label-${preset.label}`}
						id={`${preset.id}-label`}
						defaultValue={preset.label}
						onBlur={(event) => onFieldBlur("label", event.target.value)}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor={`${preset.id}-description`}>
						{t("agents.fieldDescription")}
					</Label>
					<Input
						key={`${preset.id}-${inputVersion}-description-${preset.description ?? ""}`}
						id={`${preset.id}-description`}
						defaultValue={preset.description ?? ""}
						onBlur={(event) => onFieldBlur("description", event.target.value)}
					/>
				</div>
			</div>

			{showCommands && preset.kind === "terminal" && (
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor={`${preset.id}-command`}>
							{t("agents.commandNoPrompt")}
						</Label>
						<Input
							key={`${preset.id}-${inputVersion}-command-${preset.command}`}
							id={`${preset.id}-command`}
							defaultValue={preset.command}
							onBlur={(event) => onFieldBlur("command", event.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor={`${preset.id}-prompt-command`}>
							{t("agents.commandWithPrompt")}
						</Label>
						<Input
							key={`${preset.id}-${inputVersion}-prompt-command-${preset.promptCommand}`}
							id={`${preset.id}-prompt-command`}
							defaultValue={preset.promptCommand}
							onBlur={(event) =>
								onFieldBlur("promptCommand", event.target.value)
							}
						/>
					</div>
					<div className="space-y-2 md:col-span-2">
						<Label htmlFor={`${preset.id}-prompt-command-suffix`}>
							{t("agents.promptCommandSuffix")}
						</Label>
						<Input
							key={`${preset.id}-${inputVersion}-prompt-command-suffix-${preset.promptCommandSuffix ?? ""}`}
							id={`${preset.id}-prompt-command-suffix`}
							defaultValue={preset.promptCommandSuffix ?? ""}
							onBlur={(event) =>
								onFieldBlur("promptCommandSuffix", event.target.value)
							}
							placeholder={t("agents.promptCommandSuffixPlaceholder")}
						/>
					</div>
				</div>
			)}

			{showTaskPrompts && (
				<div className="space-y-2">
					<Label htmlFor={`${preset.id}-task-template`}>
						{t("agents.taskPromptTemplate")}
					</Label>
					<Textarea
						key={`${preset.id}-${inputVersion}-task-template-${preset.taskPromptTemplate}`}
						id={`${preset.id}-task-template`}
						defaultValue={preset.taskPromptTemplate}
						onBlur={(event) =>
							onFieldBlur("taskPromptTemplate", event.target.value)
						}
						className="min-h-40 font-mono text-xs"
					/>
				</div>
			)}

			{preset.kind === "chat" && (
				<div className="space-y-2">
					<Label htmlFor={`${preset.id}-model`}>
						{t("agents.modelOverride")}
					</Label>
					<Input
						key={`${preset.id}-${inputVersion}-model-${preset.model ?? ""}`}
						id={`${preset.id}-model`}
						defaultValue={preset.model ?? ""}
						onBlur={(event) => onFieldBlur("model", event.target.value)}
						placeholder={t("agents.optionalModelId")}
					/>
				</div>
			)}

			{validationMessage && (
				<p className="text-sm text-destructive">{validationMessage}</p>
			)}
		</>
	);
}
