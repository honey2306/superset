import type { PromptTransport } from "@superset/shared/agent-prompt-launch";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { parseAgentCommandText } from "renderer/lib/agent-launch-command";
import { parseArgs } from "renderer/lib/argv";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	AgentDetailHeader,
	AgentLaunchFields,
	Section,
	StackedField,
} from "../AgentFormControls";
import { AgentIconPicker } from "../AgentIconPicker";

export interface CreateCustomAgentInput {
	label: string;
	command: string;
	args: string[];
	promptTransport: PromptTransport;
	promptArgs: string[];
	env: Record<string, string>;
	presetId: string;
	iconId?: string;
}

interface NewCustomAgentDetailProps {
	onCreate: (input: CreateCustomAgentInput) => void;
	onCancel: () => void;
	/** True while the create request is in flight. */
	isSubmitting: boolean;
}

export function NewCustomAgentDetail({
	onCreate,
	onCancel,
	isSubmitting,
}: NewCustomAgentDetailProps) {
	const { t } = useTranslation();
	const [label, setLabel] = useState("");
	const [iconId, setIconId] = useState<string | null>(null);
	const [commandText, setCommandText] = useState("");
	const [promptArgsText, setPromptArgsText] = useState("");
	const [promptTransport, setPromptTransport] =
		useState<PromptTransport>("argv");

	const trimmedLabel = label.trim();
	const parsedCommand = parseAgentCommandText(commandText);
	const canCreate =
		trimmedLabel.length > 0 &&
		parsedCommand.command.length > 0 &&
		!isSubmitting;

	const handleCreate = () => {
		if (!canCreate) return;
		onCreate({
			label: trimmedLabel,
			command: parsedCommand.command,
			args: parsedCommand.args,
			promptTransport,
			promptArgs: parseArgs(promptArgsText),
			env: parsedCommand.env,
			presetId: "custom",
			iconId: iconId ?? undefined,
		});
	};

	return (
		<div className="p-6 max-w-3xl w-full mx-auto">
			<AgentDetailHeader
				iconId={iconId}
				presetId="custom"
				title={trimmedLabel || t("agents.new")}
				subtitle={t("agents.newDescription")}
			/>

			<form
				className="space-y-6"
				onSubmit={(e) => {
					e.preventDefault();
					handleCreate();
				}}
			>
				<Section title={t("agents.identity")}>
					<StackedField label={t("agents.label")} htmlFor="new-agent-label">
						<Input
							id="new-agent-label"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
							placeholder={t("agents.labelPlaceholder")}
							autoFocus
						/>
					</StackedField>

					<StackedField label={t("agents.icon")} hint={t("agents.iconHint")}>
						<AgentIconPicker value={iconId} onChange={setIconId} />
					</StackedField>
				</Section>

				<AgentLaunchFields
					idPrefix="new-agent"
					commandText={commandText}
					onCommandTextChange={setCommandText}
					promptArgsText={promptArgsText}
					onPromptArgsTextChange={setPromptArgsText}
					promptTransport={promptTransport}
					onPromptTransportChange={setPromptTransport}
				/>

				<div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
					<Button type="button" variant="ghost" size="sm" onClick={onCancel}>
						{t("common.cancel")}
					</Button>
					<Button type="submit" size="sm" disabled={!canCreate}>
						{t("agents.add")}
					</Button>
				</div>
			</form>
		</div>
	);
}
