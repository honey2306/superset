import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getStoredToken } from "~/lib/auth-store";
import { getPhoneTransport } from "~/lib/transport";
import { MobileTerminalInput } from "./components/MobileTerminalInput";

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
	const sendRef = useRef<(data: string) => void>(() => {});

	useEffect(() => {
		if (!workspaceId || !terminalId || !containerRef.current) return;
		const terminal = new Terminal({
			cursorBlink: true,
			fontSize: 13,
			theme: { background: "#151110", foreground: "#eae8e6" },
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
		sendRef.current = (data) =>
			safeSend(JSON.stringify({ type: "input", data }));
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
			sendRef.current = () => {};
			socket.close();
			terminal.dispose();
		};
	}, [terminalId, workspaceId]);

	return (
		<main className="flex min-h-[100dvh] flex-col bg-[#151110] px-3 py-3">
			<header className="mb-2 flex items-center justify-between text-sm text-white/70">
				<Link to={`/w/${encodeURIComponent(workspaceId ?? "")}`}>
					← Workspace
				</Link>
				<span>{status}</span>
			</header>
			<div ref={containerRef} className="min-h-0 flex-1" />
			<MobileTerminalInput onSend={(data) => sendRef.current(data)} />
		</main>
	);
}
