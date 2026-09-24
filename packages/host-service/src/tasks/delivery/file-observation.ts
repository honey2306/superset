import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { TaskEditObservation } from "@superset/shared/tasks";

export function contentIdentity(content: Buffer, executable: boolean): string {
	return createHash("sha256")
		.update(executable ? "100755\0" : "100644\0")
		.update(content)
		.digest("hex");
}
export function observeFile(file: string): {
	hash: string | null;
	reliable: boolean;
} {
	try {
		const stat = lstatSync(file);
		if (!stat.isFile() || stat.size > 8 * 1024 * 1024)
			return { hash: null, reliable: false };
		const content = readFileSync(file);
		const after = lstatSync(file);
		return {
			hash: contentIdentity(content, Boolean(stat.mode & 0o111)),
			reliable:
				stat.ino === after.ino &&
				stat.mtimeMs === after.mtimeMs &&
				stat.size === after.size,
		};
	} catch (error) {
		return {
			hash: null,
			reliable: (error as NodeJS.ErrnoException).code === "ENOENT",
		};
	}
}
/** Called synchronously from SDK emission, BEFORE the mutation begins. The normal
 * async ACP event queue is too late to observe the before-image reliably. */
export class PiTaskEditTracker {
	private pending = new Map<
		string,
		{ path: string; hash: string | null; reliable: boolean }
	>();
	constructor(private cwd: string) {
		this.cwd = realpathSync(cwd);
	}
	capture(value: unknown): TaskEditObservation | undefined {
		if (!value || typeof value !== "object") return;
		const event = value as Record<string, unknown>;
		const id = event.toolCallId;
		if (typeof id !== "string") return;
		if (
			event.type === "tool_execution_start" &&
			(event.toolName === "write" || event.toolName === "edit")
		) {
			const args = event.args as { path?: unknown } | null;
			if (typeof args?.path !== "string") return;
			const path = resolve(this.cwd, args.path);
			let safe = true;
			const rel = relative(this.cwd, path);
			if (
				rel.startsWith("..") ||
				isAbsolute(rel) ||
				rel.split("/").includes(".git")
			)
				safe = false;
			try {
				const actualParent = realpathSync(dirname(path));
				if (actualParent !== dirname(path)) safe = false;
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") safe = false;
			}
			const before = observeFile(path);
			this.pending.set(id, {
				path,
				hash: before.hash,
				reliable: safe && before.reliable,
			});
		} else if (event.type === "tool_execution_end") {
			const before = this.pending.get(id);
			if (!before) return;
			this.pending.delete(id);
			const after = observeFile(before.path);
			return {
				path: before.path,
				before: before.hash,
				after: after.hash,
				toolCallId: id,
				reliable: before.reliable && after.reliable,
			};
		}
	}
}
