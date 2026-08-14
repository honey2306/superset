import type {
	AvailableCommand,
	ContentBlock,
	SessionConfigOption,
	SessionStatus,
} from "@superset/session-protocol";
import type { ComposerSlashCommand } from "renderer/screens/main/components/WorkspaceView/ContentView/components/TiptapPromptEditor/useSlashCommands";

export interface ResolveComposerDisabledInput {
	status: SessionStatus | undefined;
	isLoading: boolean;
	isAdmitting: boolean;
}

const DISABLED_STATUSES: Set<SessionStatus | undefined> = new Set([
	undefined,
	"offline",
	"dead",
	"starting",
]);

export function resolveComposerDisabled({
	status,
	isLoading,
	isAdmitting,
}: ResolveComposerDisabledInput): boolean {
	return isLoading || isAdmitting || DISABLED_STATUSES.has(status);
}

const STREAMING_STATUSES: Set<SessionStatus | undefined> = new Set([
	"running",
	"awaiting_permission",
]);

/**
 * Composer visual mode. Kept separate from `SessionStatus` so we can widen
 * later ({@code editing_permission}, {@code loading_history}) without
 * threading a fifth `resolve...` predicate through every caller.
 */
export type ComposerMode = "idle" | "streaming";

export function resolveComposerMode(
	status: SessionStatus | undefined,
): ComposerMode {
	return STREAMING_STATUSES.has(status) ? "streaming" : "idle";
}

export function resolveShowCancel(status: SessionStatus | undefined): boolean {
	return STREAMING_STATUSES.has(status);
}

/**
 * @deprecated Use `resolveComposerMode` — the composer now supports both
 * `prompt` (idle) and `enqueue` (streaming); use the mode to pick a code
 * path, not a boolean gate. Kept until every call site migrates.
 */
export function resolveCanSubmit(status: SessionStatus | undefined): boolean {
	return status === "idle";
}

/** Queue append is available whenever the session accepts work at all. */
export function resolveCanEnqueue(status: SessionStatus | undefined): boolean {
	return status !== undefined && !DISABLED_STATUSES.has(status);
}

/**
 * `sendNow` is only meaningful while a turn is in flight — otherwise the
 * normal Send path already fires immediately.
 */
export function resolveCanSendNow(status: SessionStatus | undefined): boolean {
	return STREAMING_STATUSES.has(status);
}

export function shouldClearSubmittedDraft(
	currentDraft: string,
	submittedDraft: string,
): boolean {
	return currentDraft === submittedDraft;
}

export function shouldRestoreSubmittedDraft(
	currentDraft: string,
	wasOptimisticallyCleared: boolean,
): boolean {
	return wasOptimisticallyCleared && currentDraft === "";
}

/**
 * Keeps unsent ACP composer text alive while its pane is unmounted by a tab
 * switch. This intentionally lives outside React state: panes are mounted
 * lazily by the panes engine, so component state alone cannot survive a
 * switch away and back.
 */
export interface AcpComposerDraftStore {
	get(sessionId: string): string;
	set(sessionId: string, draft: string): void;
	clear(sessionId: string): void;
}

export function createAcpComposerDraftStore(): AcpComposerDraftStore {
	const drafts = new Map<string, string>();
	return {
		get: (sessionId) => drafts.get(sessionId) ?? "",
		set: (sessionId, draft) => {
			if (draft) drafts.set(sessionId, draft);
			else drafts.delete(sessionId);
		},
		clear: (sessionId) => {
			drafts.delete(sessionId);
		},
	};
}

const acpComposerDraftStore = createAcpComposerDraftStore();

export function getAcpComposerDraft(sessionId: string): string {
	return acpComposerDraftStore.get(sessionId);
}

export function setAcpComposerDraft(sessionId: string, draft: string): void {
	acpComposerDraftStore.set(sessionId, draft);
}

export function clearAcpComposerDraft(sessionId: string): void {
	acpComposerDraftStore.clear(sessionId);
}

/** ACP only accepts image files as image content blocks. */
export function isAcpImageAttachment(attachment: {
	mediaType?: string;
}): attachment is { mediaType: string } {
	return attachment.mediaType?.startsWith("image/") ?? false;
}

type FetchFile = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export async function toAcpImageContentBlock(
	attachment: { url: string; mediaType: string },
	fetchFile: FetchFile = fetch,
): Promise<Extract<ContentBlock, { type: "image" }>> {
	const response = await fetchFile(attachment.url);
	if (!response.ok) throw new Error("Failed to read pasted image");
	const bytes = new Uint8Array(await response.arrayBuffer());
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	}
	return {
		type: "image",
		data: btoa(binary),
		mimeType: attachment.mediaType,
	};
}

export function acpCommandsToComposerCommands(
	commands: AvailableCommand[] | null | undefined,
	configOptions: SessionConfigOption[] = [],
): ComposerSlashCommand[] {
	const local: ComposerSlashCommand[] = configOptions.map((option) => {
		const values: Record<string, string | boolean> =
			option.type === "boolean"
				? { On: true, Off: false }
				: Object.fromEntries(
						option.options.flatMap((entry) =>
							"options" in entry
								? entry.options.map((value) => [value.name, value.value])
								: [[entry.name, entry.value]],
						),
					);
		const labels = Object.keys(values);
		return {
			name: option.id,
			aliases: [],
			description: option.description ?? option.name,
			argumentHint: labels.length ? `<${labels.join("|")}>` : "",
			argumentOptions: labels,
			kind: "builtin" as const,
			action:
				option.category === "mode"
					? { type: "set_mode" as const, valueByLabel: values }
					: {
							type: "set_config_option" as const,
							configId: option.id,
							valueByLabel: values,
						},
		};
	});
	const catalog = (commands ?? []).map((command) => ({
		name: command.name,
		aliases: [],
		description: command.description,
		argumentHint: command.input?.hint ?? "",
		kind: "custom" as const,
	}));
	const localNames = new Set(
		local.map((command) => command.name.toLowerCase()),
	);
	return [
		...local,
		...catalog.filter((command) => !localNames.has(command.name.toLowerCase())),
	];
}

export type ResolvedAcpConfigCommand =
	| { type: "set_mode"; value: string }
	| {
			type: "set_config_option";
			configId: string;
			value: string | boolean;
	  };

export function resolveAcpConfigCommand(
	text: string,
	commands: ComposerSlashCommand[],
	hasAttachments: boolean,
): ResolvedAcpConfigCommand | null {
	if (hasAttachments) return null;

	const match = text.trim().match(/^\/(\S+)(?:\s+(.+))?$/);
	if (!match) return null;
	const [, commandName = "", argument] = match;
	if (!argument) return null;

	const command = commands.find(
		(candidate) =>
			candidate.name.toLowerCase() === commandName.toLowerCase() &&
			(candidate.action?.type === "set_mode" ||
				candidate.action?.type === "set_config_option"),
	);
	if (
		!command?.action ||
		(command.action.type !== "set_mode" &&
			command.action.type !== "set_config_option")
	)
		return null;

	const normalizedArgument = argument.trim().toLowerCase();
	const value = Object.entries(command.action.valueByLabel).find(
		([label, raw]) =>
			label.toLowerCase() === normalizedArgument ||
			String(raw).toLowerCase() === normalizedArgument,
	)?.[1];
	if (value === undefined) throw new Error(`Unknown option: ${argument}`);

	if (command.action.type === "set_mode") {
		return { type: "set_mode", value: String(value) };
	}
	return {
		type: "set_config_option",
		configId: command.action.configId,
		value,
	};
}
