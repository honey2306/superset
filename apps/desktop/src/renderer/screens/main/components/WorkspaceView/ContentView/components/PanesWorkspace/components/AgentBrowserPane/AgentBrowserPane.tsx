import { Globe2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import "./agent-browser-pane.css";

export function AgentBrowserPane({
	sessionId,
	isVisible,
}: {
	sessionId: string;
	isVisible: boolean;
}) {
	const viewportRef = useRef<HTMLDivElement>(null);
	const state = electronTrpc.agentBrowser.state.useQuery(
		{ sessionId },
		{ refetchInterval: isVisible ? 750 : false },
	);
	const zoom = electronTrpc.window.getZoomFactor.useQuery(undefined, {
		staleTime: 30_000,
	});
	const ensurePage = electronTrpc.agentBrowser.ensurePage.useMutation();
	const setSurface = electronTrpc.agentBrowser.setSurface.useMutation();

	useEffect(() => {
		void ensurePage.mutateAsync({ sessionId });
	}, [ensurePage.mutateAsync, sessionId]);

	const syncSurface = useCallback(() => {
		const element = viewportRef.current;
		if (!isVisible || !element) {
			setSurface.mutate({ sessionId, visible: false });
			return;
		}
		const rect = element.getBoundingClientRect();
		const factor = zoom.data ?? 1;
		if (rect.width <= 0 || rect.height <= 0) return;
		setSurface.mutate({
			sessionId,
			visible: true,
			bounds: {
				x: rect.x * factor,
				y: rect.y * factor,
				width: rect.width * factor,
				height: rect.height * factor,
			},
		});
	}, [isVisible, sessionId, setSurface.mutate, zoom.data]);

	useEffect(() => {
		const element = viewportRef.current;
		if (!element) return undefined;
		let frame = 0;
		let previousBounds = "";
		const update = () => {
			const rect = element.getBoundingClientRect();
			const nextBounds = `${isVisible}:${rect.x}:${rect.y}:${rect.width}:${rect.height}:${zoom.data ?? 1}`;
			if (nextBounds !== previousBounds) {
				previousBounds = nextBounds;
				syncSurface();
			}
			frame = window.requestAnimationFrame(update);
		};
		frame = window.requestAnimationFrame(update);
		return () => {
			window.cancelAnimationFrame(frame);
			setSurface.mutate({ sessionId, visible: false });
		};
	}, [isVisible, sessionId, setSurface.mutate, syncSurface, zoom.data]);

	return (
		<div className="agent-browser-pane">
			<div ref={viewportRef} className="agent-browser-pane__viewport">
				{!state.data?.active && (
					<div className="agent-browser-pane__empty">
						<Globe2 />
						<strong>Starting local browser</strong>
						<span>The page remains alive when this pane is hidden.</span>
					</div>
				)}
			</div>
		</div>
	);
}
