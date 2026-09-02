import {
	ChevronLeft,
	ChevronRight,
	Globe2,
	Plus,
	RefreshCw,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
	const [location, setLocation] = useState("");
	const utils = electronTrpc.useUtils();
	const state = electronTrpc.agentBrowser.state.useQuery(
		{ sessionId },
		{ refetchInterval: isVisible ? 750 : false },
	);
	const zoom = electronTrpc.window.getZoomFactor.useQuery(undefined, {
		staleTime: 30_000,
	});
	const ensurePage = electronTrpc.agentBrowser.ensurePage.useMutation({
		onSuccess: () => utils.agentBrowser.state.invalidate({ sessionId }),
	});
	const setSurface = electronTrpc.agentBrowser.setSurface.useMutation();
	const selectPage = electronTrpc.agentBrowser.selectPage.useMutation({
		onSuccess: () => utils.agentBrowser.state.invalidate({ sessionId }),
	});
	const createPage = electronTrpc.agentBrowser.createPage.useMutation({
		onSuccess: () => utils.agentBrowser.state.invalidate({ sessionId }),
	});
	const closePage = electronTrpc.agentBrowser.closePage.useMutation({
		onSuccess: () => utils.agentBrowser.state.invalidate({ sessionId }),
	});
	const navigate = electronTrpc.agentBrowser.navigate.useMutation({
		onSuccess: () => utils.agentBrowser.state.invalidate({ sessionId }),
	});
	const goBack = electronTrpc.agentBrowser.goBack.useMutation();
	const goForward = electronTrpc.agentBrowser.goForward.useMutation();
	const reload = electronTrpc.agentBrowser.reload.useMutation();

	useEffect(() => {
		void ensurePage.mutateAsync({ sessionId });
	}, [ensurePage.mutateAsync, sessionId]);

	const activePage = useMemo(
		() => state.data?.pages.find((page) => page.active) ?? state.data?.pages[0],
		[state.data?.pages],
	);

	useEffect(() => {
		setLocation(
			activePage?.url === "about:blank" ? "" : (activePage?.url ?? ""),
		);
	}, [activePage?.url]);

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

	const submitLocation = () => {
		const url = location.trim();
		if (url) navigate.mutate({ sessionId, url });
	};

	return (
		<div className="agent-browser-pane">
			<div className="agent-browser-pane__toolbar">
				<div className="agent-browser-pane__nav">
					<button
						type="button"
						disabled={!activePage?.canGoBack}
						onClick={() => goBack.mutate({ sessionId })}
						title="Back"
					>
						<ChevronLeft />
					</button>
					<button
						type="button"
						disabled={!activePage?.canGoForward}
						onClick={() => goForward.mutate({ sessionId })}
						title="Forward"
					>
						<ChevronRight />
					</button>
					<button
						type="button"
						onClick={() => reload.mutate({ sessionId })}
						title="Reload"
					>
						<RefreshCw className={activePage?.loading ? "animate-spin" : ""} />
					</button>
				</div>
				<form
					className="agent-browser-pane__location"
					onSubmit={(event) => {
						event.preventDefault();
						submitLocation();
					}}
				>
					<span className="agent-browser-pane__secure" />
					<input
						aria-label="Browser address"
						value={location}
						onChange={(event) => setLocation(event.target.value)}
						placeholder="Enter a URL"
					/>
				</form>
				<label className="agent-browser-pane__pages">
					<Globe2 />
					<select
						aria-label="Browser pages"
						value={activePage?.id ?? ""}
						disabled={!state.data?.pages.length}
						onChange={(event) =>
							selectPage.mutate({ sessionId, pageId: event.target.value })
						}
					>
						{state.data?.pages.map((page) => (
							<option key={page.id} value={page.id}>
								{page.title || page.url || `Page ${page.index + 1}`}
							</option>
						))}
					</select>
					<span>{state.data?.pages.length ?? 0}</span>
				</label>
				<button
					type="button"
					className="agent-browser-pane__page-action"
					title="New page"
					onClick={() => createPage.mutate({ sessionId })}
				>
					<Plus />
				</button>
				<button
					type="button"
					className="agent-browser-pane__page-action"
					title="Close page"
					disabled={!activePage}
					onClick={() => {
						if (activePage)
							closePage.mutate({ sessionId, pageId: activePage.id });
					}}
				>
					<X />
				</button>
			</div>

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
