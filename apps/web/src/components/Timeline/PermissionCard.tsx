import {
	isAskUserPermission,
	makeCustomResponseOutcome,
	makeSelectedOutcome,
	type PendingPermission,
	type PermissionOption,
	type RequestPermissionOutcome,
	type ToolCallUpdate,
} from "@superset/session-protocol";
import { type FormEvent, useState } from "react";
import { MobileActionSheet } from "./components/MobileActionSheet";
import { MessageMarkdown } from "./MessageMarkdown";

interface Props {
	pending: PendingPermission;
	pendingCount?: number;
	sourceToolCall?: ToolCallUpdate;
	onRespond: (outcome: RequestPermissionOutcome) => Promise<void>;
}

export function getPermissionOptionLabel(option: PermissionOption): string {
	return option.name || option.optionId;
}

export function getPermissionOptionPresentation(option: PermissionOption): {
	label: string;
	description: string | null;
} {
	const value = getPermissionOptionLabel(option);
	const separator = value.indexOf(" — ");
	return separator < 0
		? { label: value, description: null }
		: {
				label: value.slice(0, separator),
				description: value.slice(separator + 3),
			};
}

export function isMultiSelectPermission(pending: PendingPermission): boolean {
	return pending.multiSelect === true;
}

export function getPermissionRequestLabel(pending: PendingPermission): string {
	const tool = pending.toolCall.title ?? pending.toolCall.kind ?? "tool";
	return isAskUserPermission(pending, pending.toolCall)
		? `Question: ${tool}`
		: `Permission requested: ${tool}`;
}

function record(value: unknown): Record<string, unknown> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export function mergePermissionToolCall(
	permissionToolCall: ToolCallUpdate,
	sourceToolCall?: ToolCallUpdate,
): ToolCallUpdate {
	if (!sourceToolCall) return permissionToolCall;
	return {
		...sourceToolCall,
		...permissionToolCall,
		rawInput: permissionToolCall.rawInput ?? sourceToolCall.rawInput,
		content: permissionToolCall.content ?? sourceToolCall.content,
		locations: permissionToolCall.locations ?? sourceToolCall.locations,
	};
}

export function getApprovalPlan(toolCall: ToolCallUpdate): string | null {
	const input = record(toolCall.rawInput);
	const plan = input?.plan;
	if (!input || typeof plan !== "string" || !plan.trim()) return null;
	const claudeCode = record(record(toolCall._meta)?.claudeCode);
	return claudeCode?.toolName === "ExitPlanMode" || "planFilePath" in input
		? plan
		: null;
}

function permissionDetail(toolCall: ToolCallUpdate): string | null {
	const input = toolCall.rawInput;
	if (typeof input === "string") return input;
	if (input === undefined || input === null) return null;
	if (typeof input !== "object") return String(input);
	try {
		return JSON.stringify(input, null, 2);
	} catch {
		return null;
	}
}

export function PermissionCard({
	pending,
	pendingCount = 1,
	sourceToolCall,
	onRespond,
}: Props) {
	const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
	const [customText, setCustomText] = useState("");
	const [responding, setResponding] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [responseError, setResponseError] = useState<string | null>(null);
	const multiSelect = isMultiSelectPermission(pending);
	const toolCall = mergePermissionToolCall(pending.toolCall, sourceToolCall);
	const askUser = isAskUserPermission(pending, toolCall);
	const plan = getApprovalPlan(toolCall);
	const selectableOptions = askUser
		? pending.options.filter((option) => !option.kind.startsWith("reject"))
		: pending.options;
	const rejectOptions = askUser
		? pending.options.filter((option) => option.kind.startsWith("reject"))
		: [];
	const title = toolCall.title ?? (askUser ? "Agent question" : "Permission");
	const tone = plan ? "plan" : askUser ? "ask" : "permission";
	const label = plan
		? "Plan ready for review"
		: askUser
			? "Agent needs your answer"
			: "Permission required";
	const summary = plan ? "Read the plan before choosing a response" : title;

	function toggleOption(optionId: string) {
		if (responding || submitted) return;
		setCustomText("");
		setSelectedOptionIds((current) =>
			multiSelect
				? current.includes(optionId)
					? current.filter((id) => id !== optionId)
					: [...current, optionId]
				: [optionId],
		);
	}

	async function submit(outcome: RequestPermissionOutcome) {
		if (responding || submitted) return;
		setResponding(true);
		setResponseError(null);
		try {
			await onRespond(outcome);
			setSubmitted(true);
		} catch {
			setResponseError("Couldn’t submit the response. Try again.");
		} finally {
			setResponding(false);
		}
	}

	function submitSelection() {
		if (selectedOptionIds.length === 0) return;
		void submit(
			multiSelect
				? makeSelectedOutcome(selectedOptionIds)
				: { outcome: "selected", optionId: selectedOptionIds[0] ?? "" },
		);
	}

	function submitCustom(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const answer = customText.trim();
		if (!answer) return;
		void submit(makeCustomResponseOutcome(answer));
	}

	const footer = submitted ? (
		<div className="mobile-permission-response-state">Response submitted</div>
	) : askUser ? (
		<>
			{rejectOptions.map((option) => (
				<button
					key={option.optionId}
					type="button"
					className="mobile-action-sheet__button"
					disabled={responding}
					onClick={() =>
						void submit({ outcome: "selected", optionId: option.optionId })
					}
				>
					{getPermissionOptionPresentation(option).label}
				</button>
			))}
			<button
				type="button"
				className="mobile-action-sheet__button"
				data-variant="primary"
				disabled={responding || selectedOptionIds.length === 0}
				onClick={submitSelection}
			>
				{responding
					? "Submitting…"
					: multiSelect
						? `Submit (${selectedOptionIds.length})`
						: "Submit answer"}
			</button>
		</>
	) : (
		<div className="mobile-permission-actions">
			{pending.options.map((option) => (
				<button
					key={option.optionId}
					type="button"
					className="mobile-action-sheet__button"
					data-kind={option.kind}
					disabled={responding}
					onClick={() =>
						void submit({ outcome: "selected", optionId: option.optionId })
					}
				>
					{responding ? "Submitting…" : getPermissionOptionLabel(option)}
				</button>
			))}
		</div>
	);

	return (
		<MobileActionSheet
			tone={tone}
			icon={plan ? "✓" : askUser ? "?" : "!"}
			label={label}
			summary={summary}
			meta={pendingCount > 1 ? `${pendingCount} waiting` : undefined}
			kicker={plan ? "Plan review" : askUser ? "AskUser" : "Permission"}
			title={title}
			subtitle={
				plan
					? "Review the complete plan, then approve it or request changes."
					: askUser
						? multiSelect
							? "Select one or more options, then submit your answer."
							: "Select one option, or type your own answer."
						: "The agent is waiting for permission to continue."
			}
			footer={footer}
		>
			{plan ? (
				<div className="mobile-permission-plan">
					<MessageMarkdown>{plan}</MessageMarkdown>
				</div>
			) : askUser ? (
				<div className="mobile-permission-options">
					{selectableOptions.map((option) => {
						const presentation = getPermissionOptionPresentation(option);
						const selected = selectedOptionIds.includes(option.optionId);
						return (
							<button
								key={option.optionId}
								type="button"
								className="mobile-permission-option"
								data-selected={selected || undefined}
								aria-pressed={selected}
								disabled={responding || submitted}
								onClick={() => toggleOption(option.optionId)}
							>
								<span
									className="mobile-permission-option__indicator"
									aria-hidden="true"
								/>
								<span>
									<strong>{presentation.label}</strong>
									{presentation.description ? (
										<small>{presentation.description}</small>
									) : null}
								</span>
							</button>
						);
					})}
				</div>
			) : permissionDetail(toolCall) ? (
				<pre className="mobile-permission-detail">
					{permissionDetail(toolCall)}
				</pre>
			) : (
				<p className="mobile-permission-empty">
					No additional request details were provided.
				</p>
			)}

			{pending.allowsCustomResponse && !submitted ? (
				<form className="mobile-permission-custom" onSubmit={submitCustom}>
					<input
						type="text"
						value={customText}
						disabled={responding}
						onChange={(event) => {
							setCustomText(event.target.value);
							if (event.target.value.trim()) setSelectedOptionIds([]);
						}}
						placeholder="Type your own answer…"
						aria-label="Custom answer"
					/>
					<button type="submit" disabled={responding || !customText.trim()}>
						Send
					</button>
				</form>
			) : null}
			{responseError ? (
				<p className="mobile-permission-error" role="alert">
					{responseError}
				</p>
			) : null}
		</MobileActionSheet>
	);
}
