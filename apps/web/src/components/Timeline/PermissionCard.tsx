import {
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

export function PermissionCard({ pending, onRespond }: Props) {
	const tool = pending.toolCall.title ?? pending.toolCall.kind ?? "tool";
	const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
	const multiSelect = isMultiSelectPermission(pending);
	const toggleOption = (optionId: string) => {
		setSelectedOptionIds((current) =>
			current.includes(optionId)
				? current.filter((id) => id !== optionId)
				: [...current, optionId],
		);
	};

	return (
		<div className="mobile-permission-card mt-2 rounded-2xl p-3 text-sm">
			<div className="mb-2 text-[var(--phone-text)]">
				Permission requested: <span className="font-mono">{tool}</span>
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
		</div>
	);
}
