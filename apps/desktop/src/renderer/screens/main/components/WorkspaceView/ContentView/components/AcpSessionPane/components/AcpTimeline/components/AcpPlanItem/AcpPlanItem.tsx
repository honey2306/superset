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
				<span aria-hidden>◫</span>
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
								"✓"
							) : entry.status === "in_progress" ? (
								<span className="acp-plan__spinner" />
							) : (
								""
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
