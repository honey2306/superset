import type { SimpleGit } from "simple-git";

/**
 * Check whether merging a ref into HEAD would conflict without touching HEAD,
 * the index, or the working tree. `git merge-tree --write-tree` performs the
 * recursive merge entirely in Git's object database and exits non-zero for
 * content conflicts.
 */
export async function wouldMergeConflict(
	git: SimpleGit,
	branch: string,
): Promise<boolean> {
	// Resolve first so an invalid/missing ref remains a normal merge error rather
	// than being misreported to the user as a conflict.
	await git.raw(["rev-parse", "--verify", `${branch}^{commit}`]);
	try {
		const output = await git.raw([
			"merge-tree",
			"--write-tree",
			"HEAD",
			branch,
		]);
		return output.includes("CONFLICT (");
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return message.includes("CONFLICT (");
	}
}
