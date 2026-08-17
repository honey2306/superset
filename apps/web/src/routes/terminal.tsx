import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getStoredToken } from "~/lib/auth-store";
import { getPhoneRoute } from "~/lib/phone-route";
import { getPhoneTransport } from "~/lib/transport";

function terminalUrl(workspaceId: string, terminalId: string): string {
	const url = new URL(
		`/terminal/${encodeURIComponent(terminalId)}`,
		location.origin,
	);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("workspaceId", workspaceId);
	url.searchParams.set("token", getStoredToken());
	return url.toString();
}

export function TerminalRoute() {
	const { workspaceId, terminalId } = useParams<{
		workspaceId: string;
		terminalId: string;
	}>();
	const containerRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState("Connecting…");

	useEffect(() => {
		if (!workspaceId || !terminalId || !containerRef.current) return;
		const rootStyle =
			typeof window !== "undefined"
				? getComputedStyle(document.documentElement)
				: null;
		const bg = rootStyle?.getPropertyValue("--phone-bg").trim() || "#0b0c10";
		const fg = rootStyle?.getPropertyValue("--phone-text").trim() || "#f8f8f2";
		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 13,
			theme: { background: bg, foreground: fg },
		});
		terminal.open(containerRef.current);
		const socket = getPhoneTransport().createWebSocket(
			terminalUrl(workspaceId, terminalId),
		);
		if ("binaryType" in socket) socket.binaryType = "arraybuffer";
		const safeSend = (data: string) => {
			if (!("readyState" in socket) || socket.readyState === WebSocket.OPEN) {
				try {
					socket.send(data);
				} catch {}
			}
		};
		const resize = () => {
			const width = containerRef.current?.clientWidth ?? 0;
			const height = containerRef.current?.clientHeight ?? 0;
			const cols = Math.max(20, Math.floor(width / 8));
			const rows = Math.max(5, Math.floor(height / 18));
			terminal.resize(cols, rows);
			safeSend(JSON.stringify({ type: "resize", cols, rows }));
		};
		socket.onopen = () => {
			setStatus("Connected");
			resize();
		};
		socket.onmessage = (event) => {
			if (event.data instanceof ArrayBuffer) {
				terminal.write(new Uint8Array(event.data));
				return;
			}
			try {
				const message = JSON.parse(String(event.data)) as {
					type?: string;
					message?: string;
				};
				if (message.type === "error")
					setStatus(message.message ?? "Terminal error");
				else if (message.type === "exit") setStatus("Process exited");
			} catch {
				setStatus("Received an invalid terminal message");
			}
		};
		socket.onclose = () => setStatus("Disconnected");
		const input = terminal.onData((data) =>
			safeSend(JSON.stringify({ type: "input", data })),
		);
		const observer = new ResizeObserver(resize);
		observer.observe(containerRef.current);
		return () => {
			observer.disconnect();
			input.dispose();
			socket.close();
			terminal.dispose();
		};
	}, [terminalId, workspaceId]);

	return (
		<main className="mobile-terminal-page">
			<header className="mobile-terminal-header">
				<Link
					to={getPhoneRoute("/")}
					className="mobile-terminal-back"
					aria-label="Back to projects"
				>
					←
				</Link>
				<div className="mobile-terminal-heading">
					<h1>Terminal</h1>
					<p>{status}</p>
				</div>
			</header>
			<div ref={containerRef} className="mobile-terminal-canvas" />
		</main>
	);
}
