/**
 * Discriminator for where a diff view's files come from. Drives the
 * collapsible-section keys in the v2 changes panel store, so it must live
 * outside the v2-workspace route tree (the store is v1-shell code that
 * survives the route removal).
 */
export type DiffFileSource =
	| { kind: "against-base"; baseBranch: string | null }
	| { kind: "staged" }
	| { kind: "unstaged" }
	| { kind: "commit"; commitHash: string; fromHash?: string };
