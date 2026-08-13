import { homedir } from "node:os";
import path from "node:path";
import { getWorkspaceName as getEnvWorkspaceName } from "shared/env.shared";
import { deriveWorkspaceNameFromWorktreeSegments } from "shared/worktree-id";

const IS_DEV = process.env.NODE_ENV === "development";
const WORKTREE_BASE = path.resolve(homedir(), ".superset/worktrees");

function getWorktreeSegmentsFromCwd(cwd: string): string[] | undefined {
	const cwdRelative = path.relative(WORKTREE_BASE, cwd);
	if (
		!cwdRelative ||
		cwdRelative.startsWith("..") ||
		path.isAbsolute(cwdRelative)
	) {
		return undefined;
	}

	const segments = cwdRelative.split(path.sep).filter(Boolean);
	return segments.length >= 2 ? segments : undefined;
}

export function resolveDevWorkspaceName(
	cwd = process.cwd(),
): string | undefined {
	if (!IS_DEV) return undefined;

	const segments = getWorktreeSegmentsFromCwd(cwd);
	return (
		(segments
			? deriveWorkspaceNameFromWorktreeSegments(segments)
			: undefined) ?? getEnvWorkspaceName()
	);
}
