import type {
	PermissionOptionKind,
	PermissionView,
	RequestPermissionOutcome,
} from "@superset/session-protocol";
import { makeSelectedOutcome } from "@superset/session-protocol";
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

function decisionTone(
	resolution: RequestPermissionOutcome,
	kind: PermissionOptionKind | undefined,
): "allow" | "reject" | "cancelled" {
	if (resolution.outcome === "cancelled") return "cancelled";
	if (kind?.startsWith("allow")) return "allow";
	if (kind?.startsWith("reject")) return "reject";
	return "cancelled";
}

// Keyboard hint per PermissionOptionKind — deterministic order 1..4.
const KIND_ORDER: PermissionOptionKind[] = [
	"allow_once",
	"allow_always",
	"reject_once",
	"reject_always",
];

function hintFor(kind: PermissionOptionKind | undefined): string {
	switch (kind) {
		case "allow_once":
			return "once";
		case "allow_always":
			return "always";
		case "reject_once":
			return "no";
		case "reject_always":
			return "never";
		default:
			return "";
	}
}

interface AcpPermissionCardProps {
	permission: PermissionView;
	onRespond(requestId: string, outcome: RequestPermissionOutcome): void;
}

export function AcpPermissionCard({
	permission,
	onRespond,
}: AcpPermissionCardProps) {
	const [pickedIds, setPickedIds] = useState<string[]>([]);
	const [responding, setResponding] = useState(false);
	const toolTitle = (permission as { toolCall?: { title?: string } }).toolCall
		?.title;
	const isMulti = !!permission.multiSelect;
	const isResolved = permission.resolution !== null;

	function handleSingleClick(optionId: string) {
		if (responding || isResolved) return;
		setResponding(true);
		onRespond(permission.requestId, { outcome: "selected", optionId });
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
		setResponding(true);
		onRespond(
			permission.requestId,
			buildPermissionOutcome({ selectedIds: pickedIds, multiSelect: true }),
		);
	}

	function handleCancelOutcome() {
		if (responding || isResolved) return;
		setResponding(true);
		onRespond(permission.requestId, { outcome: "cancelled" });
	}

	if (isResolved) {
		const res = permission.resolution;
		if (!res) return null;
		const opt = permission.options.find(
			(o) => "optionId" in res && o.optionId === res.optionId,
		);
		const label = opt?.name ?? resolutionLabel(res);
		return (
			<div className="acp-perm__resolved">
				<span aria-hidden>▲</span>
				<span>Permission ·</span>
				<span
					className="acp-perm__resolved-decision"
					data-tone={decisionTone(res, opt?.kind)}
				>
					{label}
				</span>
			</div>
		);
	}

	// Order single-select options by canonical kind so keyboard hint stays 1..4
	const orderedOptions = isMulti
		? permission.options
		: [...permission.options].sort((a, b) => {
				const ai = KIND_ORDER.indexOf(a.kind);
				const bi = KIND_ORDER.indexOf(b.kind);
				return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
			});

	return (
		<div className="acp-perm">
			<div className="acp-perm__head">
				<span className="acp-perm__pulse" aria-hidden />
				<span>
					{isMulti ? "Select options" : "Permission required"}
					{toolTitle ? ` · ${toolTitle}` : ""}
				</span>
			</div>

			{responding ? (
				<p className="acp-perm__resolved">
					<span>Submitting…</span>
				</p>
			) : isMulti ? (
				<>
					<div className="acp-perm__multi">
						{orderedOptions.map((opt) => (
							<label key={opt.optionId} className="acp-perm__multi-item">
								<input
									type="checkbox"
									checked={pickedIds.includes(opt.optionId)}
									onChange={() => toggleMulti(opt.optionId)}
								/>
								<span>{opt.name}</span>
							</label>
						))}
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
						<button
							type="button"
							className="acp-perm__action"
							data-variant="ghost"
							onClick={handleCancelOutcome}
						>
							Cancel
						</button>
					</div>
				</>
			) : (
				<>
					<div className="acp-perm__options">
						{orderedOptions.map((opt, index) => (
							<button
								key={opt.optionId}
								type="button"
								className="acp-perm__option"
								onClick={() => handleSingleClick(opt.optionId)}
							>
								<span className="acp-perm__option-key">{index + 1}</span>
								<span>{opt.name}</span>
								<span className="acp-perm__option-hint">
									{hintFor(opt.kind)}
								</span>
							</button>
						))}
					</div>
					<div className="acp-perm__actions">
						<button
							type="button"
							className="acp-perm__action"
							data-variant="ghost"
							onClick={handleCancelOutcome}
						>
							Cancel
						</button>
					</div>
				</>
			)}
		</div>
	);
}
