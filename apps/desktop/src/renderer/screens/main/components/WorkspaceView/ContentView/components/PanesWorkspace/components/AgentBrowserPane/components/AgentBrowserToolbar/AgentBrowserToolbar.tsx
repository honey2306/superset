import {
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Globe2,
	Plus,
	RefreshCw,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function AgentBrowserToolbar({
	sessionId,
	isVisible,
}: {
	sessionId: string;
	isVisible: boolean;
}) {
	const [location, setLocation] = useState("");
	const [pageMenuOpen, setPageMenuOpen] = useState(false);
	const utils = electronTrpc.useUtils();
	const state = electronTrpc.agentBrowser.state.useQuery(
		{ sessionId },
		{ refetchInterval: isVisible ? 750 : false },
	);
	const zoom = electronTrpc.window.getZoomFactor.useQuery(undefined, {
		staleTime: 30_000,
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
	const showPageMenu = electronTrpc.agentBrowser.showPageMenu.useMutation({
		onSuccess: () => utils.agentBrowser.state.invalidate({ sessionId }),
	});
	const closePageMenu = electronTrpc.agentBrowser.closePageMenu.useMutation();

	const activePage = useMemo(
		() => state.data?.pages.find((page) => page.active) ?? state.data?.pages[0],
		[state.data?.pages],
	);

	useEffect(() => {
		setLocation(
			activePage?.url === "about:blank" ? "" : (activePage?.url ?? ""),
		);
	}, [activePage?.url]);

	useEffect(
		() => () => {
			closePageMenu.mutate({ sessionId });
		},
		[closePageMenu.mutate, sessionId],
	);

	const submitLocation = () => {
		const url = location.trim();
		if (url) navigate.mutate({ sessionId, url });
	};

	return (
		<div className="agent-browser-toolbar">
			<div className="agent-browser-toolbar__nav">
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
				className="agent-browser-toolbar__location"
				onSubmit={(event) => {
					event.preventDefault();
					submitLocation();
				}}
			>
				<span className="agent-browser-toolbar__secure" />
				<input
					aria-label="Browser address"
					value={location}
					onChange={(event) => setLocation(event.target.value)}
					placeholder="Search or enter URL"
				/>
			</form>

			<button
				type="button"
				className="agent-browser-toolbar__pages"
				aria-label="Browser pages"
				aria-haspopup="menu"
				aria-expanded={pageMenuOpen}
				data-state={pageMenuOpen ? "open" : "closed"}
				disabled={!state.data?.pages.length}
				title={activePage?.title || activePage?.url || "Browser pages"}
				onClick={(event) => {
					if (pageMenuOpen) {
						closePageMenu.mutate({ sessionId });
						setPageMenuOpen(false);
						return;
					}
					const rect = event.currentTarget.getBoundingClientRect();
					const factor = zoom.data ?? 1;
					const width = 200;
					const height = Math.min(
						10 + (state.data?.pages.length ?? 0) * 30,
						190,
					);
					setPageMenuOpen(true);
					void showPageMenu
						.mutateAsync({
							sessionId,
							theme: document.documentElement.classList.contains("dark")
								? "dark"
								: "light",
							bounds: {
								x: Math.max(0, rect.right - width) * factor,
								y: (rect.bottom + 4) * factor,
								width: width * factor,
								height: height * factor,
							},
						})
						.finally(() => setPageMenuOpen(false));
				}}
			>
				<Globe2 />
				<span className="agent-browser-toolbar__page-label">
					{activePage?.title ||
						activePage?.url ||
						(activePage ? `Page ${activePage.index + 1}` : "No pages")}
				</span>
				<span className="agent-browser-toolbar__page-count">
					{state.data?.pages.length ?? 0}
				</span>
				<ChevronDown />
			</button>

			<div className="agent-browser-toolbar__page-actions">
				<button
					type="button"
					title="New page"
					onClick={() => createPage.mutate({ sessionId })}
				>
					<Plus />
				</button>
				<button
					type="button"
					title="Close page"
					disabled={!activePage}
					onClick={() => {
						if (activePage) {
							closePage.mutate({ sessionId, pageId: activePage.id });
						}
					}}
				>
					<X />
				</button>
			</div>
		</div>
	);
}
