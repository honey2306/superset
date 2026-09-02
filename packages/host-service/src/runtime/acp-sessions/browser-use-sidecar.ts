import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentBrowserToolName } from "@superset/session-protocol";

interface PendingCall {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeout: ReturnType<typeof setTimeout>;
}

interface SidecarResponse {
	id?: string;
	ok: boolean;
	result?: unknown;
	error?: string;
}

export interface BrowserUseSidecarCall {
	name: Exclude<AgentBrowserToolName, "browser_tabs" | "browser_close">;
	arguments: unknown;
	cdpUrl: string;
	targetId: string;
	allowedTargetIds: string[];
}

function executableOnPath(name: string): string | undefined {
	for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
		if (!path.isAbsolute(directory)) continue;
		const candidate = path.join(directory, name);
		if (existsSync(candidate)) return candidate;
	}
	return undefined;
}

export function resolveBrowserUsePython(): string | undefined {
	const configured = process.env.SUPERSET_BROWSER_USE_PYTHON;
	if (configured && existsSync(configured)) return configured;
	const browserUse = executableOnPath(
		process.platform === "win32" ? "browser-use.exe" : "browser-use",
	);
	if (!browserUse) return undefined;
	try {
		const firstLine = readFileSync(browserUse, "utf8").split(/\r?\n/, 1)[0];
		if (!firstLine?.startsWith("#!")) return undefined;
		const interpreter = firstLine.slice(2).trim();
		return existsSync(interpreter) ? interpreter : undefined;
	} catch {
		return undefined;
	}
}

export function resolveBrowserUseSidecarPath(
	moduleUrl: string = import.meta.url,
	cwd: string = process.cwd(),
): string {
	const here = path.dirname(fileURLToPath(moduleUrl));
	const configured = process.env.SUPERSET_AGENT_BROWSER_SIDECAR_PATH;
	const candidates = [
		configured,
		path.join(here, "sidecar", "agent-browser-sidecar.py"),
		path.resolve(here, "..", "sidecar", "agent-browser-sidecar.py"),
		// Dev watch bundles run from dist/main but non-JS resources are not part
		// of Rollup's graph. Fall back to the checked-out source until the next
		// full writeBundle copies it beside the daemon.
		path.resolve(
			cwd,
			"packages/host-service/src/runtime/acp-sessions/sidecar/agent-browser-sidecar.py",
		),
		path.resolve(
			cwd,
			"../../packages/host-service/src/runtime/acp-sessions/sidecar/agent-browser-sidecar.py",
		),
		path.resolve(
			here,
			"../../../..",
			"packages/host-service/src/runtime/acp-sessions/sidecar/agent-browser-sidecar.py",
		),
	].filter((candidate): candidate is string => Boolean(candidate));
	return (
		candidates.find(existsSync) ??
		path.join(here, "sidecar", "agent-browser-sidecar.py")
	);
}

export class BrowserUseSidecar {
	private child: ChildProcessWithoutNullStreams | null = null;
	private buffer = "";
	private stderr = "";
	private readonly pending = new Map<string, PendingCall>();

	constructor(
		private readonly options: {
			python?: string;
			scriptPath?: string;
		} = {},
	) {}

	private ensureStarted(): ChildProcessWithoutNullStreams {
		if (this.child && !this.child.killed) return this.child;
		const python = this.options.python ?? resolveBrowserUsePython();
		if (!python) {
			throw new Error(
				"Browser Use Python environment was not found. Install browser-use or set SUPERSET_BROWSER_USE_PYTHON.",
			);
		}
		const scriptPath =
			this.options.scriptPath ?? resolveBrowserUseSidecarPath();
		if (!existsSync(scriptPath)) {
			throw new Error(`Browser Use sidecar is missing: ${scriptPath}`);
		}
		const child = spawn(python, [scriptPath], {
			stdio: ["pipe", "pipe", "pipe"],
			env: process.env,
			windowsHide: true,
		});
		this.child = child;
		this.buffer = "";
		this.stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => this.onData(chunk));
		child.stderr.on("data", (chunk: string) => {
			this.stderr = `${this.stderr}${chunk}`.slice(-8_000);
		});
		child.once("exit", () => {
			if (this.child === child) this.child = null;
			const detail = this.stderr.trim();
			this.rejectAll(
				new Error(
					detail
						? `Browser Use sidecar exited: ${detail}`
						: "Browser Use sidecar exited",
				),
			);
		});
		child.once("error", (error) => this.rejectAll(error));
		return child;
	}

	async call(input: BrowserUseSidecarCall): Promise<unknown> {
		const child = this.ensureStarted();
		const id = randomUUID();
		const result = new Promise<unknown>((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error("Browser Use action timed out"));
			}, 120_000);
			this.pending.set(id, { resolve, reject, timeout });
		});
		child.stdin.write(`${JSON.stringify({ id, ...input })}\n`);
		return result;
	}

	private onData(chunk: string): void {
		this.buffer += chunk;
		for (;;) {
			const newline = this.buffer.indexOf("\n");
			if (newline < 0) return;
			const line = this.buffer.slice(0, newline);
			this.buffer = this.buffer.slice(newline + 1);
			if (!line) continue;
			let response: SidecarResponse;
			try {
				response = JSON.parse(line) as SidecarResponse;
			} catch {
				this.rejectAll(new Error("Browser Use sidecar returned invalid JSON"));
				return;
			}
			if (!response.id) continue;
			const pending = this.pending.get(response.id);
			if (!pending) continue;
			this.pending.delete(response.id);
			clearTimeout(pending.timeout);
			if (response.ok) pending.resolve(response.result);
			else
				pending.reject(
					new Error(response.error ?? "Browser Use action failed"),
				);
		}
	}

	private rejectAll(error: Error): void {
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timeout);
			pending.reject(error);
		}
		this.pending.clear();
	}

	async close(): Promise<void> {
		const child = this.child;
		this.child = null;
		if (!child) return;
		child.stdin.end();
		await new Promise<void>((resolve) => {
			const timeout = setTimeout(() => {
				child.kill("SIGTERM");
				resolve();
			}, 2_000);
			child.once("exit", () => {
				clearTimeout(timeout);
				resolve();
			});
		});
	}
}
