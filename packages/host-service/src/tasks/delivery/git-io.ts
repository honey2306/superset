import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

export function hashBytes(value: Buffer | string): string {
	return createHash("sha256").update(value).digest("hex");
}
export class GitCommandError extends Error {
	constructor(
		readonly code: number | null,
		readonly output: string,
	) {
		super(`Git command failed (${code ?? "unknown"}): ${output.slice(-4000)}`);
	}
}
export function gitCommand(
	cwd: string,
	args: string[],
	options: {
		index?: string;
		input?: Buffer;
		signal?: AbortSignal;
		timeoutMs?: number;
		onStart?: (pid: number) => void;
		allowFailure?: boolean;
	} = {},
): Promise<{ stdout: Buffer; stderr: string; code: number | null }> {
	return new Promise((resolve, reject) => {
		if (options.signal?.aborted) {
			reject(new Error("Delivery stopped before Git command"));
			return;
		}
		const env = { ...process.env };
		for (const key of [
			"GIT_DIR",
			"GIT_WORK_TREE",
			"GIT_INDEX_FILE",
			"GIT_OBJECT_DIRECTORY",
			"GIT_ALTERNATE_OBJECT_DIRECTORIES",
			"GIT_PREFIX",
		])
			delete env[key];
		Object.assign(env, {
			GIT_TERMINAL_PROMPT: "0",
			GCM_INTERACTIVE: "never",
			GIT_LITERAL_PATHSPECS: "1",
		});
		if (options.index) env.GIT_INDEX_FILE = options.index;
		const child = spawn("git", ["--no-optional-locks", ...args], {
			cwd,
			env,
			detached: process.platform !== "win32",
			stdio: ["pipe", "pipe", "pipe"],
		});
		const chunks: Buffer[] = [];
		let bytes = 0,
			stderr = "",
			error: Error | undefined,
			killTimer: ReturnType<typeof setTimeout> | undefined;
		const stop = () => {
			if (child.pid)
				try {
					process.kill(
						process.platform === "win32" ? child.pid : -child.pid,
						"SIGTERM",
					);
				} catch {}
			killTimer ??= setTimeout(() => {
				if (child.pid)
					try {
						process.kill(
							process.platform === "win32" ? child.pid : -child.pid,
							"SIGKILL",
						);
					} catch {}
			}, 750);
		};
		const timeout = setTimeout(() => {
			error = new Error(
				"Git operation timed out; reconcile its actual result before retrying",
			);
			stop();
		}, options.timeoutMs ?? 20_000);
		options.signal?.addEventListener("abort", stop, { once: true });
		child.stdout.on("data", (data: Buffer) => {
			bytes += data.length;
			if (bytes > 16 * 1024 * 1024) {
				error = new Error("Git output exceeded delivery limit");
				stop();
			} else chunks.push(data);
		});
		child.stderr.on("data", (data: Buffer) => {
			stderr = (stderr + data.toString()).slice(-64 * 1024);
		});
		child.on("spawn", () => {
			try {
				if (child.pid) options.onStart?.(child.pid);
			} catch (cause) {
				error = cause instanceof Error ? cause : new Error(String(cause));
				stop();
			}
		});
		child.on("error", (cause) => {
			error = cause;
		});
		child.stdin.on("error", () => {});
		child.stdin.end(options.input);
		child.on("close", (code) => {
			clearTimeout(timeout);
			if (killTimer) clearTimeout(killTimer);
			options.signal?.removeEventListener("abort", stop);
			const stdout = Buffer.concat(chunks);
			if (error) {
				reject(error);
				return;
			}
			if (code !== 0 && !options.allowFailure) {
				reject(new GitCommandError(code, stderr || stdout.toString()));
				return;
			}
			resolve({ stdout, stderr, code });
		});
	});
}
export async function gitText(cwd: string, args: string[]) {
	return (await gitCommand(cwd, args)).stdout.toString("utf8").trim();
}

export async function deliveryTarget(cwd: string, remote: string) {
	if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(remote))
		throw new Error("Invalid configured Git remote name");
	const urls = (
		await gitText(cwd, ["remote", "get-url", "--push", "--all", remote])
	)
		.split("\n")
		.filter(Boolean);
	if (urls.length !== 1)
		throw new Error("Delivery requires exactly one push destination");
	const url = urls[0];
	if (
		!url ||
		[...url].some(
			(char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
		) ||
		url.startsWith("-") ||
		url.includes("::")
	)
		throw new Error("Unsupported Git push destination");
	if (url.includes("://")) {
		const parsed = new URL(url);
		if (
			!["https:", "http:", "ssh:", "file:"].includes(parsed.protocol) ||
			parsed.password ||
			parsed.search ||
			parsed.hash ||
			((parsed.protocol === "http:" || parsed.protocol === "https:") &&
				parsed.username)
		)
			throw new Error(
				"Use a Git credential helper or SSH; embedded credentials and custom remote helpers are not supported",
			);
	}
	return { remote, url, targetHash: hashBytes(url) };
}
export async function inspectDelivery(cwd: string) {
	const branch = await gitText(cwd, [
		"symbolic-ref",
		"--quiet",
		"--short",
		"HEAD",
	]);
	const names = (await gitText(cwd, ["remote"])).split("\n").filter(Boolean);
	const remotes: Array<{ remote: string; url: string; targetHash: string }> =
		[];
	for (const remote of names) {
		try {
			remotes.push(await deliveryTarget(cwd, remote));
		} catch {
			/* Unsupported targets are never offered for publishing. */
		}
	}
	return { branch, remotes };
}
