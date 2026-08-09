export interface SparseCheckoutValidation {
	paths: string[];
	error: string | null;
}

/** Mirrors the host's input normalization so invalid paths are explained early. */
export function validateSparseCheckoutPaths(
	input: string,
): SparseCheckoutValidation {
	const paths = new Set<string>();
	for (const line of input.split("\n")) {
		const path = line
			.trim()
			.replaceAll("\\", "/")
			.replace(/^(?:\.\/|\/)+|\/+$/g, "");
		if (!path) continue;
		if (path.split("/").some((part) => part === ".." || part.startsWith("-"))) {
			return { paths: [], error: `Invalid sparse checkout path: ${line}` };
		}
		paths.add(path);
	}
	if (paths.size > 200) {
		return { paths: [], error: "Too many sparse checkout folders (max 200)" };
	}
	return { paths: [...paths], error: null };
}

export function formatSparseCheckoutPaths(paths: string[]): string {
	return paths.join("\n");
}
