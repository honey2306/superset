export interface BranchTag {
	/** 去掉 `feat/`、`codex/`、用户名等前缀后的核心名 */
	label: string;
	/** 由完整分支名决定的稳定颜色（CSS 变量引用，自动跟随明暗主题） */
	color: string;
}

/* 每个分支自己的颜色。避开品牌粉（全站保留给当前项）与危险红（有故障语义）， */
const BRANCH_PALETTE = [
	"var(--success)",
	"var(--info)",
	"var(--warning)",
	"var(--accent-2)",
];

/** 稳定哈希：同一个分支名永远拿到同一个颜色，换台机器也一样 */
function hashBranchName(branch: string): number {
	let hash = 0;
	for (let index = 0; index < branch.length; index += 1) {
		hash = (hash * 31 + branch.charCodeAt(index)) >>> 0;
	}
	return hash;
}

/** 前缀信息量低却很占宽度，剥掉只留核心名；颜色仍由完整名决定，避免剥完撞名 */
function stripBranchPrefix(branch: string): string {
	const slashIndex = branch.indexOf("/");
	if (slashIndex <= 0) return branch;
	const rest = branch.slice(slashIndex + 1);
	return rest || branch;
}

export function formatBranchTag(branch: string): BranchTag {
	const trimmed = branch.trim();
	if (!trimmed) return { label: "", color: BRANCH_PALETTE[0] as string };

	return {
		label: stripBranchPrefix(trimmed),
		color: BRANCH_PALETTE[
			hashBranchName(trimmed) % BRANCH_PALETTE.length
		] as string,
	};
}
