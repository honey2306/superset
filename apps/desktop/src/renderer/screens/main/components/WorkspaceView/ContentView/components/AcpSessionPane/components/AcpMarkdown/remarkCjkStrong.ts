interface MarkdownPosition {
	start: { offset?: number };
	end: { offset?: number };
}

interface MarkdownNode {
	type: string;
	value?: string;
	children?: MarkdownNode[];
	position?: MarkdownPosition;
}

interface MarkdownFile {
	value?: unknown;
}

const CJK_CHARACTER =
	"[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}]";
const CJK_STRONG_PATTERN = new RegExp(
	`(^|[\\s\\p{P}])\\*\\*(\\S(?:[^*\\n]*?\\S)?)\\*\\*(?=${CJK_CHARACTER})`,
	"gu",
);

function sourceContainsLiteralStrong(
	node: MarkdownNode,
	content: string,
	source: string,
): boolean {
	const start = node.position?.start.offset;
	const end = node.position?.end.offset;
	if (start === undefined || end === undefined) return false;
	return source.slice(start, end).includes(`**${content}**`);
}

function recoverCjkStrong(node: MarkdownNode, source: string): MarkdownNode[] {
	const value = node.value ?? "";
	const result: MarkdownNode[] = [];
	let cursor = 0;

	for (const match of value.matchAll(CJK_STRONG_PATTERN)) {
		if (match.index === undefined || !match[2]) continue;
		if (!sourceContainsLiteralStrong(node, match[2], source)) continue;

		const boundaryLength = match[1]?.length ?? 0;
		const strongStart = match.index + boundaryLength;
		if (strongStart > cursor) {
			result.push({ type: "text", value: value.slice(cursor, strongStart) });
		}
		result.push({
			type: "strong",
			children: [{ type: "text", value: match[2] }],
		});
		cursor = match.index + match[0].length;
	}

	if (result.length === 0) return [node];
	if (cursor < value.length) {
		result.push({ type: "text", value: value.slice(cursor) });
	}
	return result;
}

function transformChildren(node: MarkdownNode, source: string): void {
	if (!node.children || node.type === "code" || node.type === "inlineCode")
		return;
	node.children = node.children.flatMap((child) => {
		if (child.type === "text") return recoverCjkStrong(child, source);
		transformChildren(child, source);
		return [child];
	});
}

/** Recovers intended strong emphasis rejected at a CJK intraword boundary. */
export function remarkCjkStrong() {
	return (tree: MarkdownNode, file: MarkdownFile) => {
		const source = typeof file.value === "string" ? file.value : "";
		transformChildren(tree, source);
	};
}
