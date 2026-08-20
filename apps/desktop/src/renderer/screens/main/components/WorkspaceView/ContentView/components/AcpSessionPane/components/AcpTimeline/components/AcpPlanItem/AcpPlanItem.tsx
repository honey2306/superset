import type { PlanItem } from "@superset/session-protocol";
import { useState } from "react";

interface AcpPlanItemProps {
	item: PlanItem;
	review?: {
		isSubmitting: boolean;
		onApprove(feedback?: string): Promise<void>;
		onRequestChanges(feedback: string): Promise<void>;
	};
}

export function AcpPlanItem({ item, review }: AcpPlanItemProps) {
	const [feedback, setFeedback] = useState("");
	const [action, setAction] = useState<"approve" | "revise" | null>(null);
	const done = item.entries.filter((e) => e.status === "completed").length;
	const inProgress = item.entries.filter(
		(e) => e.status === "in_progress",
	).length;
	const total = item.entries.length;
	const trimmedFeedback = feedback.trim();

	async function submit(nextAction: "approve" | "revise") {
		if (!review || review.isSubmitting || action) return;
		if (nextAction === "revise" && !trimmedFeedback) return;
		setAction(nextAction);
		try {
			if (nextAction === "approve") {
				await review.onApprove(trimmedFeedback || undefined);
			} else {
				await review.onRequestChanges(trimmedFeedback);
			}
		} finally {
			setAction(null);
		}
	}

	return (
		<div className="acp-plan" data-removed={item.removed ? "true" : undefined}>
			<div className="acp-plan__head">
				<span>Plan{item.removed ? " (removed)" : ""}</span>
				<span className="acp-plan__head-progress">
					{done + inProgress} / {total}
					{inProgress > 0 && " in progress"}
				</span>
			</div>
			<ol className="acp-plan__items">
				{item.entries.map((entry, i) => (
					<li
						// biome-ignore lint/suspicious/noArrayIndexKey: plan entries have no stable id
						key={`e-${i}`}
						className="acp-plan__item"
						data-status={entry.status}
					>
						<span className="acp-plan__box" aria-hidden>
							{entry.status === "completed" ? (
								<svg
									aria-hidden="true"
									viewBox="0 0 16 16"
									fill="none"
									stroke="#50fa7b"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<circle cx="8" cy="8" r="6.5" />
									<path d="M5 8l2 2 4-4" />
								</svg>
							) : entry.status === "in_progress" ? (
								<svg
									aria-hidden="true"
									className="acp-plan__spinner"
									viewBox="0 0 16 16"
									fill="none"
									stroke="#ffb86c"
									strokeWidth="2"
									strokeLinecap="round"
								>
									<path d="M8 2 A6 6 0 0 1 14 8" />
								</svg>
							) : (
								<svg
									aria-hidden="true"
									viewBox="0 0 16 16"
									fill="none"
									stroke="rgba(255,255,255,0.2)"
									strokeWidth="2"
								>
									<circle cx="8" cy="8" r="6.5" />
								</svg>
							)}
						</span>
						<span className="acp-plan__text">{entry.content}</span>
						{entry.priority && (
							<span className="acp-plan__priority" data-level={entry.priority}>
								{entry.priority}
							</span>
						)}
					</li>
				))}
			</ol>
			{review && (
				<div className="acp-plan__review">
					<label className="acp-plan__feedback">
						<span>Feedback (optional)</span>
						<textarea
							value={feedback}
							onChange={(event) => setFeedback(event.target.value)}
							placeholder="Add feedback for revisions…"
							disabled={review.isSubmitting || action !== null}
							rows={3}
						/>
					</label>
					<div className="acp-plan__actions">
						<button
							type="button"
							disabled={
								review.isSubmitting || action !== null || !trimmedFeedback
							}
							onClick={() => void submit("revise")}
						>
							{action === "revise" ? "Sending…" : "Request changes"}
						</button>
						<button
							type="button"
							data-variant="primary"
							disabled={review.isSubmitting || action !== null}
							onClick={() => void submit("approve")}
						>
							{action === "approve" ? "Approving…" : "Approve plan"}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
