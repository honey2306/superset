import { useCallback } from "react";
import { buildPRContext } from "../../components/PRActionHeader/utils/buildPRContext";
import type { PRFlowState } from "../../components/PRActionHeader/utils/getPRFlowState";

/**
 * Builds a PR-creation launch payload (prompt + synthesized `pr-context.md`
 * attachment). The chat pane that used to consume this payload has been
 * removed, so `usePRFlowDispatch` is currently a no-op dispatcher kept only
 * to preserve the PRActionHeader contract while the Create-PR button stays
 * gated off (`CREATE_PR_BUTTON_ENABLED = false`). When PR creation is
 * re-enabled it should target a terminal agent or a new surface, not chat.
 */
export interface ChatLaunchPayload {
	initialPrompt?: string;
	initialFiles?: Array<{
		data: string;
		mediaType: string;
		filename?: string;
	}>;
	model?: string;
	taskSlug?: string;
}

export type OpenChatFn = (launchConfig: ChatLaunchPayload) => void;

export interface PRFlowDispatchArgs {
	state: PRFlowState;
	draft?: boolean;
}

export type PRFlowDispatch = (args: PRFlowDispatchArgs) => void;

interface UsePRFlowDispatchOptions {
	onOpenChat?: OpenChatFn;
}

export function usePRFlowDispatch({
	onOpenChat,
}: UsePRFlowDispatchOptions = {}): PRFlowDispatch {
	return useCallback(
		({ state, draft }: PRFlowDispatchArgs) => {
			const plan = planDispatch(state, { draft: draft === true });
			if (!plan) return;
			if (!onOpenChat) return;
			onOpenChat({
				initialPrompt: plan.prompt,
				initialFiles: [plan.attachment],
			});
		},
		[onOpenChat],
	);
}

interface DispatchPlan {
	prompt: string;
	attachment: {
		data: string;
		mediaType: string;
		filename: string;
	};
}

export function planDispatch(
	state: PRFlowState,
	options: { draft: boolean },
): DispatchPlan | null {
	switch (state.kind) {
		case "no-pr": {
			const prompt = options.draft ? "/pr/create-pr --draft" : "/pr/create-pr";
			const markdown = buildPRContext(state);
			return {
				prompt,
				attachment: {
					data: encodeAsDataUrl(markdown, "text/markdown"),
					mediaType: "text/markdown",
					filename: "pr-context.md",
				},
			};
		}
		// MVP scope: other states don't dispatch yet.
		default:
			return null;
	}
}

function encodeAsDataUrl(content: string, mediaType: string): string {
	// `unescape` is removed from WHATWG; use TextEncoder for UTF-8 → base64.
	// Branch names + commit messages can carry non-ASCII characters.
	const base64 =
		typeof btoa === "function"
			? btoa(
					Array.from(new TextEncoder().encode(content), (b) =>
						String.fromCharCode(b),
					).join(""),
				)
			: Buffer.from(content, "utf-8").toString("base64");
	return `data:${mediaType};base64,${base64}`;
}
