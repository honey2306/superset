import type {
	PermissionView,
	RequestPermissionOutcome,
	ToolCallUpdate,
} from "@superset/session-protocol";
import {
	makeSelectedOutcome,
	selectedOptionIds,
} from "@superset/session-protocol";
import { useState } from "react";

export interface BuildPermissionOutcomeInput {
	selectedIds: string[];
	multiSelect: boolean;
}

export function buildPermissionOutcome({
	selectedIds,
	multiSelect,
}: BuildPermissionOutcomeInput): RequestPermissionOutcome {
	if (!multiSelect) {
		const first = selectedIds[0];
		if (!first) throw new Error("No option selected");
		return { outcome: "selected", optionId: first };
	}
	return makeSelectedOutcome(selectedIds);
}

function resolutionLabel(resolution: RequestPermissionOutcome): string {
	if (resolution.outcome === "cancelled") return "Cancelled";
	if ("optionId" in resolution) {
		return `Selected: ${resolution.optionId}`;
	}
	return "Responded";
}

function selectedResolutionLabel(
	resolution: RequestPermissionOutcome,
	options: PermissionView["options"],
): string {
	if (resolution.outcome !== "selected") return resolutionLabel(resolution);
	return selectedOptionIds(resolution)
		.map(
			(optionId) =>
				options.find((option) => option.optionId === optionId)?.name ??
				optionId,
		)
		.join(", ");
}

function decisionTone(
	resolution: RequestPermissionOutcome,
	kind: PermissionView["options"][number]["kind"] | undefined,
): "allow" | "reject" | "cancelled" {
	if (resolution.outcome === "cancelled") return "cancelled";
	if (kind?.startsWith("allow")) return "allow";
	if (kind?.startsWith("reject")) return "reject";
	return "cancelled";
}

type PermissionWithToolCall = PermissionView & {
	toolCall?: ToolCallUpdate;
};

function stringArray(value: unknown): string[] | null {
	return Array.isArray(value) && value.every((part) => typeof part === "string")
		? value
		: null;
}

export function approvalDetail(
	toolCall: ToolCallUpdate | undefined,
): string | null {
	if (!toolCall) return null;
	const rawInput = toolCall.rawInput;
	if (typeof rawInput === "string") return rawInput;
	if (rawInput === undefined || rawInput === null) return null;
	if (typeof rawInput !== "object") return String(rawInput);

	const input = rawInput as Record<string, unknown>;
	if (toolCall.kind === "execute") {
		for (const key of ["command", "cmd", "script"]) {
			const value = input[key];
			const command =
				typeof value === "string" ? value : stringArray(value)?.join(" ");
			if (!command?.trim()) continue;
			const args = stringArray(input.args);
			return args?.length ? `${command} ${args.join(" ")}` : command;
		}
	}

	try {
		return JSON.stringify(rawInput, null, 2);
	} catch {
		return String(rawInput);
	}
}

export function mergePermissionToolCall(
	permissionToolCall: ToolCallUpdate | undefined,
	sourceToolCall: ToolCallUpdate | undefined,
): ToolCallUpdate | undefined {
	if (!sourceToolCall) return permissionToolCall;
	if (!permissionToolCall) return sourceToolCall;
	return {
		...sourceToolCall,
		...permissionToolCall,
		rawInput: permissionToolCall.rawInput ?? sourceToolCall.rawInput,
		content: permissionToolCall.content ?? sourceToolCall.content,
		locations: permissionToolCall.locations ?? sourceToolCall.locations,
	};
}

/**
 * Older persisted cards predate PendingPermission.isElicitation. Recover the
 * visual treatment only from Claude's explicit tool metadata on the source
 * tool call; option labels and titles are not a reliable discriminator.
 */
export function isAskUserPermission(
	permission: { isElicitation?: boolean },
	sourceToolCall: ToolCallUpdate | undefined,
): boolean {
	if (permission.isElicitation === true) return true;
	const meta = sourceToolCall?._meta;
	if (!meta || typeof meta !== "object") return false;
	const claudeCode = (meta as { claudeCode?: unknown }).claudeCode;
	return (
		typeof claudeCode === "object" &&
		claudeCode !== null &&
		(claudeCode as { toolName?: unknown }).toolName === "AskUserQuestion"
	);
}

interface AcpPermissionCardProps {
	permission: PermissionWithToolCall;
	sourceToolCall?: ToolCallUpdate;
	pendingCount?: number;
	onRespond(
		requestId: string,
		outcome: RequestPermissionOutcome,
	): Promise<void>;
	/**
	 * Visual variant — permission (pink) is the default, askuser (cyan) is used
	 * for synthetic elicitation cards (Claude Code's AskUserQuestion tool).
	 */
	variant?: "permission" | "askuser";
}

export function AcpPermissionCard({
	permission,
	sourceToolCall,
	pendingCount = 1,
	onRespond,
	variant = "permission",
}: AcpPermissionCardProps) {
	const [pickedIds, setPickedIds] = useState<string[]>([]);
	const [responding, setResponding] = useState(false);
	const toolCall = mergePermissionToolCall(permission.toolCall, sourceToolCall);
	const toolTitle = toolCall?.title;
	const detail = approvalDetail(toolCall);
	const isMulti = !!permission.multiSelect;
	const isResolved = permission.resolution !== null;
	const selectableOptions = isMulti
		? permission.options.filter((option) => !option.kind.startsWith("reject"))
		: permission.options;
	const rejectOptions = isMulti
		? permission.options.filter((option) => option.kind.startsWith("reject"))
		: [];

	async function submit(outcome: RequestPermissionOutcome) {
		setResponding(true);
		try {
			await onRespond(permission.requestId, outcome);
		} catch {
			setResponding(false);
		}
	}

	function handleSingleClick(optionId: string) {
		if (responding || isResolved) return;
		void submit({ outcome: "selected", optionId });
	}

	function toggleMulti(optionId: string) {
		if (responding || isResolved) return;
		setPickedIds((prev) =>
			prev.includes(optionId)
				? prev.filter((id) => id !== optionId)
				: [...prev, optionId],
		);
	}

	function submitMulti() {
		if (pickedIds.length === 0 || responding || isResolved) return;
		void submit(
			buildPermissionOutcome({ selectedIds: pickedIds, multiSelect: true }),
		);
	}

	if (isResolved) {
		const res = permission.resolution;
		if (!res) return null;
		const opt = permission.options.find(
			(o) => "optionId" in res && o.optionId === res.optionId,
		);
		const label =
			variant === "askuser"
				? selectedResolutionLabel(res, permission.options)
				: (opt?.name ?? resolutionLabel(res));
		return (
			<div className="acp-perm__resolved" data-variant={variant}>
				<span aria-hidden>{variant === "askuser" ? "✓" : "▲"}</span>
				<span>{variant === "askuser" ? "AskUser ·" : "Permission ·"}</span>
				<span
					className="acp-perm__resolved-decision"
					data-tone={decisionTone(res, opt?.kind)}
				>
					{variant === "askuser" && res.outcome === "selected"
						? `Answered: ${label}`
						: label}
				</span>
			</div>
		);
	}

	return (
		<div className="acp-perm" data-variant={variant}>
			<div className="acp-perm__head">
				<span className="acp-perm__pulse" aria-hidden />
				<span>
					{variant === "askuser"
						? "Agent asking · AskUser"
						: isMulti
							? "Select options"
							: pendingCount > 1
								? `Permission required · ${pendingCount} queued`
								: "Permission required"}
				</span>
			</div>

			{variant === "permission" && (toolTitle || detail) && (
				<div className="acp-perm__context">
					<span className="acp-perm__context-label">
						{toolCall?.kind === "execute" && detail
							? "Command"
							: detail
								? "Input"
								: "Request"}
					</span>
					<code className="acp-perm__context-value select-text cursor-text">
						{detail ?? `${toolTitle} — agent provided no request details`}
					</code>
				</div>
			)}

			{variant === "askuser" && toolTitle && (
				<p className="acp-perm__question select-text cursor-text">
					{toolTitle}
				</p>
			)}

			{responding ? (
				<p className="acp-perm__resolved">
					<span>Submitting…</span>
				</p>
			) : isMulti ? (
				<>
					<div className="acp-perm__multi">
						{selectableOptions.map((opt) => {
							const isSelected = pickedIds.includes(opt.optionId);
							return (
								<label
									key={opt.optionId}
									className="acp-perm__multi-item"
									data-selected={isSelected}
								>
									<input
										type="checkbox"
										checked={isSelected}
										onChange={() => toggleMulti(opt.optionId)}
									/>
									<span className="acp-perm__multi-indicator" aria-hidden>
										✓
									</span>
									<span>{opt.name}</span>
								</label>
							);
						})}
					</div>
					<div className="acp-perm__actions">
						<button
							type="button"
							className="acp-perm__action"
							disabled={pickedIds.length === 0}
							onClick={submitMulti}
						>
							Done ({pickedIds.length})
						</button>
						{rejectOptions.map((option) => (
							<button
								key={option.optionId}
								type="button"
								className="acp-perm__action"
								data-variant="ghost"
								disabled={responding}
								onClick={() => handleSingleClick(option.optionId)}
							>
								{option.name}
							</button>
						))}
					</div>
				</>
			) : (
				<div className="acp-perm__options">
					{permission.options.map((opt, index) => (
						<button
							key={opt.optionId}
							type="button"
							className="acp-perm__option"
							onClick={() => handleSingleClick(opt.optionId)}
						>
							<span className="acp-perm__option-key">{index + 1}</span>
							<span>{opt.name}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
