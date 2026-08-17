import { useEffect, useRef } from "react";
import { AcpTurnMarker } from "../AcpTurnMarker";

export interface AcpTurnRailItem {
	id: string;
	turnNumber: number;
	isComplete: boolean;
	userPreview: string;
	agentPreview: string | null;
}

interface AcpTurnRailProps {
	items: readonly AcpTurnRailItem[];
	activeTurnId: string | null;
	agentLabel?: string;
	onNavigate(turnId: string, turnNumber: number): void;
}

export function AcpTurnRail({
	items,
	activeTurnId,
	agentLabel,
	onNavigate,
}: AcpTurnRailProps) {
	const trackRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const track = trackRef.current;
		const activeIndex = items.findIndex((item) => item.id === activeTurnId);
		const activeMarker = track?.children.item(
			activeIndex,
		) as HTMLElement | null;
		if (!track || !activeMarker) return;

		const markerTop = activeMarker.offsetTop;
		const markerBottom = markerTop + activeMarker.offsetHeight;
		if (markerTop < track.scrollTop) {
			track.scrollTop = markerTop;
		} else if (markerBottom > track.scrollTop + track.clientHeight) {
			track.scrollTop = markerBottom - track.clientHeight;
		}
	}, [activeTurnId, items]);

	if (items.length === 0) return null;

	return (
		<nav className="acp-turn-rail" aria-label="Conversation turns">
			<div className="acp-turn-rail__track" ref={trackRef}>
				{items.map((item) => (
					<AcpTurnMarker
						key={item.id}
						turnNumber={item.turnNumber}
						isActive={activeTurnId === item.id}
						isComplete={item.isComplete}
						userPreview={item.userPreview}
						agentPreview={item.agentPreview}
						agentLabel={agentLabel}
						onNavigate={() => onNavigate(item.id, item.turnNumber)}
					/>
				))}
			</div>
		</nav>
	);
}
