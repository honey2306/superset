import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef } from "react";
import { getHostServiceWsToken } from "renderer/lib/host-service-auth";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTerminalAppearance } from "renderer/lib/terminal/appearance/useTerminalAppearance";
import {
	attachToContainer,
	createRuntime,
	disposeRuntime,
} from "renderer/lib/terminal/terminal-runtime";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import {
	type GhAuthTerminalSession,
	startGhAuthTerminalSession,
} from "./gh-auth-terminal-session";

const GH_AUTH_COMMAND =
	"gh auth login --hostname github.com --git-protocol https --web";

interface GhAuthTerminalProps {
	/** Fired when the gh process exits (success or failure). */
	onExit: () => void;
}

export function GhAuthTerminal({ onExit }: GhAuthTerminalProps) {
	const appearance = useTerminalAppearance();
	const appearanceRef = useRef(appearance);
	appearanceRef.current = appearance;
	const containerRef = useRef<HTMLDivElement>(null);
	const onExitRef = useRef(onExit);
	onExitRef.current = onExit;
	const { waitForHostReady } = useLocalHostService();

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const paneId = `onboarding-gh-auth-${crypto.randomUUID()}`;
		const runtime = createRuntime(paneId, appearanceRef.current);
		let session: GhAuthTerminalSession | null = null;
		let cancelled = false;
		const syncSize = () => {
			session?.resize(runtime.terminal.cols, runtime.terminal.rows);
		};
		attachToContainer(runtime, container, syncSize);

		// The dialog animates in, so the container often lacks final dimensions
		// at mount and the initial fit measures wrong. Refit once the dialog has
		// settled, then push the corrected size to the PTY.
		const refit = () => {
			if (!containerRef.current) return;
			runtime.fitAddon.fit();
			syncSize();
		};
		const refitTimers = [
			window.setTimeout(refit, 100),
			window.setTimeout(refit, 350),
		];

		const inputDisposable = runtime.terminal.onData((data) => {
			session?.write(data);
		});

		void (async () => {
			const hostUrl = await waitForHostReady();
			if (!hostUrl) throw new Error("Local terminal service is unavailable");
			const wsAuthToken = getHostServiceWsToken(hostUrl);
			if (!wsAuthToken)
				throw new Error("Local terminal authentication is missing");
			const started = await startGhAuthTerminalSession({
				hostUrl,
				command: GH_AUTH_COMMAND,
				cols: runtime.terminal.cols,
				rows: runtime.terminal.rows,
				client: getHostServiceClientByUrl(hostUrl),
				wsAuthToken,
				onData: (data) => runtime.terminal.write(data),
				onExit: () => onExitRef.current(),
			});
			if (cancelled) {
				await started.kill();
				return;
			}
			session = started;
			syncSize();
		})().catch((error) => {
			if (cancelled) return;
			const message = error instanceof Error ? error.message : String(error);
			runtime.terminal.writeln(`\r\n[terminal] ${message}`);
		});

		return () => {
			cancelled = true;
			for (const timer of refitTimers) window.clearTimeout(timer);
			inputDisposable.dispose();
			if (session) void session.kill();
			disposeRuntime(runtime);
		};
	}, [waitForHostReady]);

	return (
		<div className="relative h-full w-full overflow-hidden">
			<div ref={containerRef} className="h-full w-full" />
		</div>
	);
}
