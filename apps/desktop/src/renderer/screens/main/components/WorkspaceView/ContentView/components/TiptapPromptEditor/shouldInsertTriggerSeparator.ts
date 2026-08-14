interface TriggerPrecedingNode {
	isText: boolean;
	type: { name: string };
}

export function shouldInsertTriggerSeparator(
	nodeBefore: TriggerPrecedingNode | null,
	charBefore: string,
): boolean {
	if (!nodeBefore || nodeBefore.type.name === "hardBreak") return false;
	return nodeBefore.isText
		? Boolean(charBefore && !/\s$/.test(charBefore))
		: true;
}
