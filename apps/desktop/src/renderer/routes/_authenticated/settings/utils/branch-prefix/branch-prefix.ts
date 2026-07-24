import type { BranchPrefixMode } from "@superset/local-db";
import type { MessageKey } from "renderer/providers/I18nProvider";

export const BRANCH_PREFIX_MODE_LABEL_KEYS: Record<
	BranchPrefixMode,
	MessageKey
> = {
	none: "branchPrefix.mode.none",
	github: "branchPrefix.mode.github",
	author: "branchPrefix.mode.author",
	custom: "branchPrefix.mode.custom",
};

export const BRANCH_PREFIX_MODE_LABEL_KEYS_WITH_DEFAULT: Record<
	BranchPrefixMode | "default",
	MessageKey
> = {
	default: "branchPrefix.mode.default",
	...BRANCH_PREFIX_MODE_LABEL_KEYS,
};
