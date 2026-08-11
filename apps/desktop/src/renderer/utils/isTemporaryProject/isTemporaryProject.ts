interface TemporaryProjectCandidate {
	kind: string;
	repoPath: string;
}

const LEGACY_TEMPORARY_PROJECT_SUFFIX = "/Superset/temporary";

/**
 * Recognizes both current temporary projects and legacy rows that were
 * persisted as repositories before temporary project identity was added.
 */
export function isTemporaryProject({
	kind,
	repoPath,
}: TemporaryProjectCandidate): boolean {
	return (
		kind === "temporary" ||
		repoPath.replaceAll("\\", "/").endsWith(LEGACY_TEMPORARY_PROJECT_SUFFIX)
	);
}
