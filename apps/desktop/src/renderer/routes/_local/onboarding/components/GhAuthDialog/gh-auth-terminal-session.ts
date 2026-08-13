import type { HostServiceClient } from "renderer/lib/host-service-client";

export interface GhAuthTerminalSession {
	write(data: string): void;
	resize(cols: number, rows: number): void;
	kill(): Promise<void>;
}

interface StartGhAuthTerminalSessionOptions {
	hostUrl: string;
	command: string;
	cols: number;
	rows: number;
	client: HostServiceClient;
	wsAuthToken: string;
	onData(data: Uint8Array): void;
	onExit(exitCode: number, signal: number): void;
	createWebSocket?: (url: string) => WebSocket;
}

export function buildGhAuthTerminalWsUrl(args: {
	hostUrl: string;
	terminalId: string;
	attachmentToken: string;
	wsAuthToken: string;
}): string {
	const url = new URL(
		`/terminal/transient/${encodeURIComponent(args.terminalId)}`,
		args.hostUrl,
	);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("token", args.wsAuthToken);
	url.searchParams.set("attachmentToken", args.attachmentToken);
	return url.toString();
}

export async function startGhAuthTerminalSession(
	options: StartGhAuthTerminalSessionOptions,
): Promise<GhAuthTerminalSession> {
	const created = await options.client.terminal.transient.create.mutate({
		command: options.command,
		cols: options.cols,
		rows: options.rows,
	});
	const capability = {
		terminalId: created.terminalId,
		attachmentToken: created.attachmentToken,
	};
	const socket = (options.createWebSocket ?? ((url) => new WebSocket(url)))(
		buildGhAuthTerminalWsUrl({
			hostUrl: options.hostUrl,
			...capability,
			wsAuthToken: options.wsAuthToken,
		}),
	);
	socket.binaryType = "arraybuffer";
	let exited = false;
	let killed = false;

	socket.addEventListener("message", (event) => {
		if (event.data instanceof ArrayBuffer) {
			options.onData(new Uint8Array(event.data));
			return;
		}
		try {
			const message = JSON.parse(String(event.data)) as {
				type?: string;
				exitCode?: number;
				signal?: number;
			};
			if (message.type === "exit" && !exited) {
				exited = true;
				options.onExit(message.exitCode ?? 0, message.signal ?? 0);
			}
		} catch {
			// Ignore malformed control frames; binary PTY output remains usable.
		}
	});

	return {
		write(data) {
			if (exited || killed) return;
			void options.client.terminal.transient.write.mutate({
				...capability,
				data,
			});
		},
		resize(cols, rows) {
			if (exited || killed) return;
			void options.client.terminal.transient.resize.mutate({
				...capability,
				cols,
				rows,
			});
		},
		async kill() {
			if (killed) return;
			killed = true;
			socket.close(1000, "Gh auth terminal disposed");
			await options.client.terminal.transient.kill.mutate(capability);
		},
	};
}
