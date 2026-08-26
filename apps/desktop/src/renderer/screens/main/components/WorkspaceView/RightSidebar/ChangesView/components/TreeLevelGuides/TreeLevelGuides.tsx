interface TreeLevelGuidesProps {
	level: number;
}

export function TreeLevelGuides({ level }: TreeLevelGuidesProps) {
	if (level === 0) return null;

	return (
		<div className="flex self-stretch shrink-0" data-tree-level-guides>
			{Array.from({ length: level }).map((_, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static visual dividers that never reorder
				<div key={index} className="w-4 self-stretch border-r border-line" />
			))}
		</div>
	);
}
