import { isTaskTerminal, type TaskGuidanceInput } from "@superset/shared/tasks";
import { Button } from "@superset/ui/button";
import { Textarea } from "@superset/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { type ManagedRun, managedTaskKeys } from "../../../../task-types";

export function TaskGuidanceComposer({
	hostUrl,
	run,
}: {
	hostUrl: string;
	run: ManagedRun;
}) {
	const { t } = useTranslation();
	const id = useId();
	const queryClient = useQueryClient();
	const [text, setText] = useState("");
	const [kind, setKind] = useState<"guidance" | "constraint">("guidance");
	const request = useRef<TaskGuidanceInput | null>(null);
	const send = useMutation({
		mutationFn: () => {
			if (
				!request.current ||
				request.current.text !== text.trim() ||
				request.current.kind !== kind
			)
				request.current = {
					id: crypto.randomUUID(),
					runId: run.id,
					expectedRevision: run.revision,
					text: text.trim(),
					kind,
				};
			return getHostServiceClientByUrl(hostUrl).tasks.guide.mutate(
				request.current,
			);
		},
		onSuccess: () => {
			setText("");
			request.current = null;
		},
		onError: (error) => {
			if (error.message.includes("requirements changed"))
				request.current = null;
		},
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: managedTaskKeys.all(hostUrl),
			});
		},
	});
	if (isTaskTerminal(run.status) || run.desiredState === "cancelled")
		return null;
	return (
		<form
			className="space-y-2"
			onSubmit={(event) => {
				event.preventDefault();
				send.mutate();
			}}
		>
			<div className="flex items-center justify-between gap-2">
				<label htmlFor={`${id}-text`} className="text-sm font-medium">
					{t("agentTasks.liveGuidance")}
				</label>
				<select
					aria-label={t("agentTasks.guidanceKind")}
					value={kind}
					onChange={(event) => setKind(event.target.value as typeof kind)}
					className="rounded-md border bg-background p-1 text-xs"
					disabled={send.isPending}
				>
					<option value="guidance">{t("agentTasks.guidance")}</option>
					<option value="constraint">{t("agentTasks.constraint")}</option>
				</select>
			</div>
			<div className="flex items-end gap-2">
				<Textarea
					id={`${id}-text`}
					className="min-h-16 resize-none"
					rows={2}
					value={text}
					onChange={(event) => setText(event.target.value)}
					placeholder={t("agentTasks.instructionPlaceholder")}
					maxLength={12000}
					disabled={send.isPending}
				/>
				<Button
					type="submit"
					size="sm"
					disabled={send.isPending || !text.trim() || run.status === "pausing"}
				>
					{t("agentTasks.sendGuidance")}
				</Button>
			</div>
			<p className="text-xs text-muted-foreground">
				{run.desiredState === "paused"
					? t("agentTasks.pausedGuidance")
					: t("agentTasks.liveHint")}
			</p>
			{send.error && (
				<p
					role="alert"
					className="select-text cursor-text text-xs text-destructive"
				>
					{send.error.message}
				</p>
			)}
		</form>
	);
}
