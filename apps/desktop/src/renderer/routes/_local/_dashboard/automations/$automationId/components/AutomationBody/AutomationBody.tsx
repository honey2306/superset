import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { EmojiTextInput } from "renderer/components/EmojiTextInput";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import type { LocalAutomation } from "renderer/routes/_local/_dashboard/hooks/useLocalAutomationData";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useProjectFileSearch } from "../../../hooks/useProjectFileSearch";

export function AutomationBody({
	automation,
}: {
	automation: LocalAutomation;
}) {
	const [name, setName] = useState(automation.name);
	const [prompt, setPrompt] = useState(automation.prompt);
	const lastSyncedPromptRef = useRef(automation.prompt);
	const queryClient = useQueryClient();
	const { machineId, activeHostUrl: hostUrl } = useLocalHostService();

	useEffect(() => {
		if (automation.prompt !== lastSyncedPromptRef.current) {
			lastSyncedPromptRef.current = automation.prompt;
			setPrompt(automation.prompt);
		}
	}, [automation.prompt]);

	const updateMutation = useMutation({
		mutationFn: (patch: { name?: string }) => {
			if (!hostUrl) throw new Error("Local host service is unavailable");
			return getHostServiceClientByUrl(hostUrl).automations.update.mutate({
				id: automation.id,
				...patch,
			});
		},
	});

	const setPromptMutation = useMutation({
		mutationFn: (next: string) => {
			if (!hostUrl) throw new Error("Local host service is unavailable");
			return getHostServiceClientByUrl(hostUrl).automations.setPrompt.mutate({
				id: automation.id,
				prompt: next,
			});
		},
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["automation-versions", automation.id],
			});
		},
	});

	const searchFiles = useProjectFileSearch({
		hostId: machineId,
		projectId: automation.projectId,
	});

	return (
		<div className="flex-1 overflow-y-auto px-8 py-8">
			<EmojiTextInput
				value={name}
				onChange={setName}
				onBlur={(next) => {
					const trimmed = next.trim();
					if (trimmed && trimmed !== automation.name) {
						updateMutation.mutate({ name: trimmed });
					}
				}}
				placeholder="Automation title"
				className="mb-6 text-2xl font-semibold"
			/>
			<MarkdownEditor
				content={prompt}
				onChange={setPrompt}
				onSave={(next) => {
					if (next !== automation.prompt) {
						setPromptMutation.mutate(next);
					}
				}}
				placeholder="Add prompt e.g. look for crashes in $sentry"
				searchFiles={searchFiles}
			/>
		</div>
	);
}
