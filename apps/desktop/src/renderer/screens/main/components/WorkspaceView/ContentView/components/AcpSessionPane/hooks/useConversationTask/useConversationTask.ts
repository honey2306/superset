import type {
	ContentBlock,
	SessionScopedState,
} from "@superset/session-protocol";
import { isAcpHarness } from "@superset/shared/agent-catalog";
import { isTaskTerminal, taskChatBlocksSchema } from "@superset/shared/tasks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";

export const conversationTaskKey = (hostUrl: string, sessionId: string) =>
	["conversation-task", hostUrl, sessionId] as const;
export function useConversationTask({
	hostUrl,
	sessionId,
	state,
	visible,
}: {
	hostUrl: string;
	sessionId: string;
	state: SessionScopedState | null | undefined;
	visible: boolean;
}) {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const api = getHostServiceClientByUrl(hostUrl).tasks;
	const [draftTaskMode, setDraftTaskMode] = useState(false);
	const [kind, setKind] = useState<"guidance" | "constraint">("guidance");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const admission = useRef({ key: "", id: crypto.randomUUID() });
	const guidance = useRef({ key: "", id: crypto.randomUUID(), revision: 0 });
	const enabled = Boolean(state) && visible;
	const query = useQuery({
		queryKey: conversationTaskKey(hostUrl, sessionId),
		enabled,
		queryFn: () => api.forSession.query({ sessionId }),
		retry: 1,
		refetchInterval: (q) =>
			!visible
				? false
				: q.state.data?.owned && !isTaskTerminal(q.state.data.run.status)
					? 1000
					: 5000,
	});
	const owned = query.data?.owned ? query.data.run : null;
	const active = owned && !isTaskTerminal(owned.status) ? owned : null;
	const supported = isAcpHarness(state?.harness);
	const refresh = useCallback(async () => {
		await queryClient.invalidateQueries({
			queryKey: conversationTaskKey(hostUrl, sessionId),
		});
		void queryClient.invalidateQueries({
			queryKey: ["managed-tasks", hostUrl],
		});
	}, [hostUrl, sessionId, queryClient]);
	const perform = async (action: () => Promise<unknown>) => {
		setBusy(true);
		setError(null);
		try {
			await action();
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			throw e;
		} finally {
			setBusy(false);
		}
	};
	const release = async () => {
		if (owned) await api.releaseConversation.mutate({ runId: owned.id });
		setDraftTaskMode(false);
	};
	const routeMessage = async (
		blocks: ContentBlock[],
		ordinary: (blocks: ContentBlock[]) => Promise<unknown>,
	) => {
		if ((draftTaskMode || owned) && (query.error || !query.isFetched))
			throw new Error(t("taskChat.loadError"));
		// Ordinary chat does not wait for a new Task lookup. The Host admission
		// guard still rejects stale/unowned submissions if another tab started a Task.
		if (!active && !draftTaskMode) {
			if (owned) await perform(release);
			await ordinary(blocks);
			return;
		}
		const parsed = taskChatBlocksSchema.parse(blocks);
		const text = parsed
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("\n")
			.trim();
		const attachments = parsed.filter((block) => block.type === "image");
		if (active) {
			if (active.phase === "delivering")
				throw new Error(t("taskChat.readOnlyDelivery"));
			if (!text) throw new Error(t("taskChat.attachments"));
			const key = JSON.stringify([active.id, kind, text, attachments]);
			if (guidance.current.key !== key)
				guidance.current = {
					key,
					id: crypto.randomUUID(),
					revision: active.revision,
				};
			await perform(async () => {
				await api.guide.mutate({
					id: guidance.current.id,
					runId: active.id,
					expectedRevision: guidance.current.revision,
					text,
					kind,
					...(attachments.length ? { attachments } : {}),
				});
				if (active.status === "paused")
					await api.resume.mutate({ runId: active.id, instruction: "" });
			});
			guidance.current.key = "";
			return;
		}
		if (draftTaskMode) {
			if (!supported) throw new Error(t("taskChat.unsupported"));
			if (!text) throw new Error(t("taskChat.attachments"));
			const key = JSON.stringify(parsed);
			if (admission.current.key !== key)
				admission.current = { key, id: crypto.randomUUID() };
			await perform(async () => {
				if (owned) await release();
				await api.startFromConversation.mutate({
					id: admission.current.id,
					sessionId,
					prompt: parsed,
					acceptanceMode: "project",
					strategy: "auto",
					acceptance: "",
				});
			});
			admission.current.key = "";
			setDraftTaskMode(false);
			return;
		}
		if (owned) await perform(release);
		await ordinary(blocks);
	};
	return {
		query,
		active,
		owned,
		run: query.data?.run ?? null,
		data: query.data,
		kind,
		setKind,
		busy,
		error,
		taskMode: Boolean(active) || draftTaskMode,
		supported,
		canChooseMode: supported && state?.status === "idle" && !active && !busy,
		chooseMode: setDraftTaskMode,
		routeMessage,
		blocked: Boolean(
			active?.phase === "delivering" ||
				active?.status === "cancelling" ||
				active?.status === "pausing",
		),
		control: async (
			action: "pause" | "cancel" | "resume" | "accept" | "release",
		) => {
			if (!owned) return;
			await perform(async () => {
				if (action === "release") return release();
				if (action === "pause") return api.pause.mutate({ runId: owned.id });
				if (action === "cancel") return api.cancel.mutate({ runId: owned.id });
				if (action === "resume")
					return api.resume.mutate({ runId: owned.id, instruction: "" });
				return api.accept.mutate({ runId: owned.id });
			});
		},
	};
}
export type ConversationTaskController = ReturnType<typeof useConversationTask>;
