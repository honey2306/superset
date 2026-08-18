import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";

interface AcpTurnMarkerProps {
	turnNumber: number;
	isActive: boolean;
	isComplete: boolean;
	isLoaded?: boolean;
	userPreview: string;
	agentPreview: string | null;
	agentLabel?: string;
	onNavigate(): void;
}

export function AcpTurnMarker({
	turnNumber,
	isActive,
	isComplete,
	isLoaded = true,
	userPreview,
	agentPreview,
	agentLabel,
	onNavigate,
}: AcpTurnMarkerProps) {
	const turnLabel = `Turn ${turnNumber}`;
	const resolvedAgentLabel = agentLabel ?? "Agent";
	const statusLabel = isComplete ? "Complete" : "In progress";
	const agentSummary =
		agentPreview ??
		(isComplete ? "No text response" : "Waiting for a response…");

	return (
		<HoverCard openDelay={220} closeDelay={80}>
			<HoverCardTrigger asChild>
				<button
					type="button"
					className="acp-turn-marker"
					data-active={isActive ? "true" : undefined}
					data-loaded={isLoaded ? "true" : "false"}
					aria-current={isActive ? "step" : undefined}
					aria-label={`${turnLabel}, ${statusLabel}. You: ${userPreview}. ${resolvedAgentLabel}: ${agentSummary}`}
					onClick={onNavigate}
				>
					<span className="acp-turn-marker__tick" aria-hidden />
				</button>
			</HoverCardTrigger>
			<HoverCardContent
				side="right"
				align="start"
				sideOffset={8}
				className="acp-turn-preview"
			>
				<div className="acp-turn-preview__header">
					<span>{turnLabel}</span>
					<span
						className="acp-turn-preview__status"
						data-complete={isComplete ? "true" : undefined}
					>
						{statusLabel}
					</span>
				</div>
				<div className="acp-turn-preview__section" data-role="user">
					<div className="acp-turn-preview__label">You</div>
					<p>{userPreview}</p>
				</div>
				<div className="acp-turn-preview__divider" />
				<div className="acp-turn-preview__section" data-role="agent">
					<div className="acp-turn-preview__label">{resolvedAgentLabel}</div>
					<p>{agentSummary}</p>
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
