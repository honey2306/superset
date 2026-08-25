import {
	isAskUserPermission,
	makeCustomResponseOutcome,
	makeSelectedOutcome,
	type PendingPermission,
	type PermissionOption,
	type RequestPermissionOutcome,
} from "@superset/session-protocol";
import { useState } from "react";

interface Props {
	pending: PendingPermission;
	onRespond: (outcome: RequestPermissionOutcome) => void;
}

export function getPermissionOptionLabel(option: PermissionOption): string {
	return option.name || option.optionId;
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

export function PermissionCard({ pending, onRespond }: Props) {
	const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
	const [customText, setCustomText] = useState("");
	const multiSelect = isMultiSelectPermission(pending);
	const toggleOption = (optionId: string) => {
		setCustomText("");
		setSelectedOptionIds((current) =>
			current.includes(optionId)
				? current.filter((id) => id !== optionId)
				: [...current, optionId],
		);
	};

	return (
		<div className="mobile-permission-card mt-2 rounded-2xl p-3 text-sm">
			<div className="mb-2 text-[var(--phone-text)]">
				{getPermissionRequestLabel(pending)}
			</div>
			<div className="flex flex-wrap gap-2">
				{pending.options.map((option) => (
					<button
						key={option.optionId}
						type="button"
						onClick={() =>
							multiSelect
								? toggleOption(option.optionId)
								: onRespond({ outcome: "selected", optionId: option.optionId })
						}
						className="mobile-primary-button flex-1 px-3 py-2 text-sm"
						aria-pressed={
							multiSelect
								? selectedOptionIds.includes(option.optionId)
								: undefined
						}
					>
						{getPermissionOptionLabel(option)}
					</button>
				))}
				{multiSelect ? (
					<button
						type="button"
						disabled={selectedOptionIds.length === 0}
						onClick={() => onRespond(makeSelectedOutcome(selectedOptionIds))}
						className="mobile-primary-button w-full px-3 py-2 text-sm font-medium disabled:opacity-40"
					>
						Done
					</button>
				) : null}
			</div>
			{pending.allowsCustomResponse ? (
				<>
					<div className="my-2 flex items-center gap-2 text-xs text-[var(--phone-muted)]">
						<span className="h-px flex-1 bg-[var(--phone-border)]" />
						<span>or</span>
						<span className="h-px flex-1 bg-[var(--phone-border)]" />
					</div>
					<form
						className="mt-2 flex gap-2"
						onSubmit={(event) => {
							event.preventDefault();
							if (!customText.trim()) return;
							onRespond(makeCustomResponseOutcome(customText));
						}}
					>
						<input
							type="text"
							value={customText}
							onChange={(event) => {
								setCustomText(event.target.value);
								if (event.target.value.trim()) setSelectedOptionIds([]);
							}}
							placeholder="Type your own answer…"
							aria-label="Custom answer"
							className="min-w-0 flex-1 rounded-lg border border-[var(--phone-border)] bg-transparent px-3 py-2 text-[var(--phone-text)]"
						/>
						<button
							type="submit"
							disabled={!customText.trim()}
							className="mobile-primary-button px-3 py-2 text-sm disabled:opacity-40"
						>
							Send
						</button>
					</form>
				</>
			) : null}
		</div>
	);
}
