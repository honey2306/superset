import type {
	EffectiveTaskStrategy,
	SelectedTaskCheck,
	TaskContract,
	TaskProfileSnapshot,
} from "@superset/shared/tasks";

/** Deliberately small, bounded project-relative glob dialect, not arbitrary regex. */
export function matchesTaskPath(pattern: string, path: string): boolean {
	let source = "^";
	for (let i = 0; i < pattern.length; i++) {
		const char = pattern[i];
		if (char === "*" && pattern[i + 1] === "*") {
			if (pattern[i + 2] === "/") {
				source += "(?:.*/)?";
				i += 2;
			} else {
				source += ".*";
				i++;
			}
		} else if (char === "*") source += "[^/]*";
		else if (char === "?") source += "[^/]";
		else source += char?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`${source}$`).test(path);
}
export function changedTaskPaths(
	baseline: Record<string, string> | null,
	current: Record<string, string> | undefined,
): string[] | null {
	if (!baseline || !current) return null;
	return [...new Set([...Object.keys(baseline), ...Object.keys(current)])]
		.filter((path) => baseline[path] !== current[path])
		.sort();
}
export function isSharedCheckInput(path: string): boolean {
	return (
		/(?:^|\/)(?:package\.json|bun\.lockb?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|(?:tsconfig|jsconfig)[^/]*\.json|(?:vite|vitest|jest|playwright|biome|turbo)[^/]*\.(?:ts|js|mjs|cjs|json|jsonc)|AGENTS\.md)$/.test(
			path,
		) || /^(?:scripts\/|\.github\/|\.superset\/)/.test(path)
	);
}
export function chooseTaskChecks(input: {
	contract: TaskContract;
	profile: TaskProfileSnapshot | null;
	paths: string[] | null;
	strategy: EffectiveTaskStrategy;
	additionalIds?: string[];
}): SelectedTaskCheck[] {
	const chosen: SelectedTaskCheck[] = input.contract.checks.map(
		(check, index) => ({
			...check,
			key: `task:${index}`,
			reason: "Explicit task acceptance requirement",
		}),
	);
	if (!input.profile) return chosen;
	const broad =
		input.paths === null ||
		input.strategy === "deep" ||
		input.paths.some(isSharedCheckInput);
	for (const check of input.profile.config.checks) {
		const extra = input.additionalIds?.includes(check.id);
		const paths =
			input.paths?.filter((path) =>
				check.paths.some((pattern) => matchesTaskPath(pattern, path)),
			) ?? [];
		if (broad || extra || !check.paths.length || paths.length)
			chosen.push({
				name: check.name,
				command: check.command,
				timeoutMs: check.timeoutMs,
				reuse: check.reuse,
				key: `project:${check.id}`,
				reason: broad
					? "Expanded coverage: shared/high-impact or uncertain inputs"
					: extra
						? "Additional approved check requested by the agent"
						: !check.paths.length
							? "Required for every task in this project"
							: `Changed inputs: ${paths.slice(0, 6).join(", ")}`,
			});
	}
	// Agent suggestions can only add already-approved checks; never remove required ones.
	for (const id of input.additionalIds ?? [])
		if (!input.profile.config.checks.some((check) => check.id === id))
			throw new Error(`Unknown project acceptance check: ${id}`);
	return chosen;
}
