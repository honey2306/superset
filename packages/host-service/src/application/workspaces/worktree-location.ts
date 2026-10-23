import { eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { hostSettings } from "../../db/schema";
import {
	defaultWorktreesRoot,
	normalizeWorktreeBaseDir,
} from "./shared/worktree-paths";

export interface HostWorktreeLocationSettings {
	worktreeBaseDir: string | null;
	defaultWorktreeBaseDir: string;
}

export function getHostWorktreeBaseDir(ctx: { db: HostDb }): string | null {
	return (
		ctx.db
			.select({ worktreeBaseDir: hostSettings.worktreeBaseDir })
			.from(hostSettings)
			.where(eq(hostSettings.id, 1))
			.get()?.worktreeBaseDir ?? null
	);
}

export function getWorktreeLocation(ctx: {
	db: HostDb;
}): HostWorktreeLocationSettings {
	return {
		worktreeBaseDir: getHostWorktreeBaseDir(ctx),
		defaultWorktreeBaseDir: defaultWorktreesRoot(),
	};
}

export function setWorktreeLocation(
	ctx: { db: HostDb },
	value: string | null,
): HostWorktreeLocationSettings {
	const worktreeBaseDir = normalizeWorktreeBaseDir(value);
	ctx.db
		.insert(hostSettings)
		.values({ id: 1, worktreeBaseDir })
		.onConflictDoUpdate({ target: hostSettings.id, set: { worktreeBaseDir } })
		.run();
	return { worktreeBaseDir, defaultWorktreeBaseDir: defaultWorktreesRoot() };
}
