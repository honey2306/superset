const FILE_LINK_PREFIX = "#superset-file=";

interface MarkdownNode {
	type: string;
	value?: string;
	url?: string;
	children?: MarkdownNode[];
}

export interface MarkdownFileTarget {
	path: string;
	line?: number;
	column?: number;
}

interface LinkMatch {
	start: number;
	end: number;
	href: string;
	type: "file" | "url";
	target?: MarkdownFileTarget;
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>[\]'"`]+/giu;
const FILE_PATH_PATTERN =
	/(?:file:\/\/\/|[a-z]:[\\/]|(?:\.{0,2}|~)?[\\/])?(?:[^\s<>:"'`|?*()[\]{}]+[\\/])+[^\s<>:"'`|?*()[\]{}]+(?:\.[a-z0-9_-]+)(?::\d+(?::\d+)?)?/giu;
const TRAILING_PUNCTUATION = /[.,;:!?，。；：！？]+$/u;

function trimUrl(raw: string): string {
	let value = raw.replace(TRAILING_PUNCTUATION, "");
	const pairs = [
		["(", ")"],
		["[", "]"],
		["{", "}"],
	] as const;
	for (const [open, close] of pairs) {
		while (
			value.endsWith(close) &&
			value.split(close).length > value.split(open).length
		) {
			value = value.slice(0, -1);
		}
	}
	return value;
}

function parseFileTarget(raw: string): MarkdownFileTarget {
	const location = /:(\d+)(?::(\d+))?$/.exec(raw);
	if (!location) return { path: raw };
	return {
		path: raw.slice(0, location.index),
		line: Number(location[1]),
		...(location[2] ? { column: Number(location[2]) } : {}),
	};
}

export function encodeMarkdownFileHref(target: MarkdownFileTarget): string {
	return `${FILE_LINK_PREFIX}${encodeURIComponent(JSON.stringify(target))}`;
}

export function decodeMarkdownFileHref(
	href: string | undefined,
): MarkdownFileTarget | null {
	if (!href?.startsWith(FILE_LINK_PREFIX)) return null;
	try {
		const value = JSON.parse(
			decodeURIComponent(href.slice(FILE_LINK_PREFIX.length)),
		) as Partial<MarkdownFileTarget>;
		if (typeof value.path !== "string" || value.path.length === 0) return null;
		return {
			path: value.path,
			...(typeof value.line === "number" ? { line: value.line } : {}),
			...(typeof value.column === "number" ? { column: value.column } : {}),
		};
	} catch {
		return null;
	}
}

export function getMarkdownFileTarget(
	href: string | undefined,
): MarkdownFileTarget | null {
	const encoded = decodeMarkdownFileHref(href);
	if (encoded) return encoded;
	if (!href || href.startsWith("#")) {
		return null;
	}
	if (/^[a-z][a-z0-9+.-]*:/iu.test(href) && !href.startsWith("file:///")) {
		return null;
	}
	FILE_PATH_PATTERN.lastIndex = 0;
	const match = FILE_PATH_PATTERN.exec(href);
	FILE_PATH_PATTERN.lastIndex = 0;
	if (!match || match.index !== 0 || match[0].length !== href.length)
		return null;
	return parseFileTarget(href);
}

function findLinkMatches(value: string): LinkMatch[] {
	const matches: LinkMatch[] = [];
	for (const match of value.matchAll(URL_PATTERN)) {
		if (match.index === undefined) continue;
		const url = trimUrl(match[0]);
		if (!url) continue;
		matches.push({
			start: match.index,
			end: match.index + url.length,
			href: url.startsWith("www.") ? `https://${url}` : url,
			type: "url",
		});
	}

	for (const match of value.matchAll(FILE_PATH_PATTERN)) {
		if (match.index === undefined) continue;
		const start = match.index;
		const end = start + match[0].length;
		if (
			matches.some(
				(candidate) => start < candidate.end && end > candidate.start,
			)
		) {
			continue;
		}
		const target = parseFileTarget(match[0]);
		matches.push({
			start,
			end,
			href: encodeMarkdownFileHref(target),
			type: "file",
			target,
		});
	}

	return matches.sort((a, b) => a.start - b.start);
}

function linkNode(match: LinkMatch, child: MarkdownNode): MarkdownNode {
	return {
		type: "link",
		url: match.href,
		children: [child],
	};
}

function linkifyText(node: MarkdownNode): MarkdownNode[] {
	const value = node.value ?? "";
	const matches = findLinkMatches(value);
	if (matches.length === 0) return [node];

	const result: MarkdownNode[] = [];
	let cursor = 0;
	for (const match of matches) {
		if (match.start > cursor) {
			result.push({ type: "text", value: value.slice(cursor, match.start) });
		}
		result.push(
			linkNode(match, {
				type: "text",
				value: value.slice(match.start, match.end),
			}),
		);
		cursor = match.end;
	}
	if (cursor < value.length) {
		result.push({ type: "text", value: value.slice(cursor) });
	}
	return result;
}

function linkifyInlineCode(node: MarkdownNode): MarkdownNode[] {
	const value = node.value ?? "";
	const matches = findLinkMatches(value);
	if (
		matches.length !== 1 ||
		matches[0]?.start !== 0 ||
		matches[0]?.end !== value.length
	) {
		return [node];
	}
	return [linkNode(matches[0], node)];
}

function transformChildren(node: MarkdownNode): void {
	if (!node.children || node.type === "link" || node.type === "code") return;
	node.children = node.children.flatMap((child) => {
		if (child.type === "text") return linkifyText(child);
		if (child.type === "inlineCode") return linkifyInlineCode(child);
		transformChildren(child);
		return [child];
	});
}

/** Linkifies ACP file paths and URL-shaped inline code after Markdown parsing. */
export function remarkAcpLinks() {
	return (tree: MarkdownNode) => transformChildren(tree);
}
