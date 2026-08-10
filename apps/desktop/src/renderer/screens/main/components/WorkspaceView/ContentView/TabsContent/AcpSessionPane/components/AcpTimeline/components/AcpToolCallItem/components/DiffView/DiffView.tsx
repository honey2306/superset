interface DiffViewProps {
	path: string;
	oldText?: string | null;
	newText: string;
	onOpenFile?(path: string): void;
}

interface DiffLine {
	kind: "add" | "del" | "ctx";
	ln?: number;
	text: string;
}

/**
 * Build a line-oriented view of a diff from an old/new text pair.
 *
 * The ACP `Diff` content block gives us whole-file before/after strings, not a
 * pre-computed hunk. To render an add/del/ctx row layout without a full diff
 * library we do a simple longest-common-prefix + suffix trim: shared leading
 * and trailing lines become context, and the middle becomes `del` followed by
 * `add`. This is enough for typical single-hunk edits (which is what Claude
 * emits); a more sophisticated diff can plug in later.
 */
function buildDiffLines(
	oldText: string | null | undefined,
	newText: string,
): DiffLine[] {
	if (oldText == null) {
		return newText.split("\n").map((text, i) => ({
			kind: "add",
			ln: i + 1,
			text,
		}));
	}
	const oldLines = oldText.split("\n");
	const newLines = newText.split("\n");
	let head = 0;
	while (
		head < oldLines.length &&
		head < newLines.length &&
		oldLines[head] === newLines[head]
	) {
		head += 1;
	}
	let tail = 0;
	while (
		tail < oldLines.length - head &&
		tail < newLines.length - head &&
		oldLines[oldLines.length - 1 - tail] ===
			newLines[newLines.length - 1 - tail]
	) {
		tail += 1;
	}
	const ctxBefore = oldLines.slice(Math.max(0, head - 1), head);
	const ctxAfter = oldLines.slice(
		oldLines.length - tail,
		Math.min(oldLines.length, oldLines.length - tail + 1),
	);
	const dels = oldLines.slice(head, oldLines.length - tail);
	const adds = newLines.slice(head, newLines.length - tail);

	const lines: DiffLine[] = [];
	ctxBefore.forEach((text, i) => {
		lines.push({ kind: "ctx", ln: head - ctxBefore.length + i + 1, text });
	});
	dels.forEach((text, i) => {
		lines.push({ kind: "del", ln: head + i + 1, text });
	});
	adds.forEach((text, i) => {
		lines.push({ kind: "add", ln: head + i + 1, text });
	});
	ctxAfter.forEach((text, i) => {
		lines.push({
			kind: "ctx",
			ln: oldLines.length - tail + i + 1,
			text,
		});
	});
	return lines;
}

export function DiffView({
	path,
	oldText,
	newText,
	onOpenFile,
}: DiffViewProps) {
	const lines = buildDiffLines(oldText, newText);
	const plus = lines.filter((l) => l.kind === "add").length;
	const minus = lines.filter((l) => l.kind === "del").length;
	return (
		<div className="acp-diff">
			<div className="acp-diff__head">
				{onOpenFile ? (
					<button
						type="button"
						className="acp-diff__head-path acp-diff__head-path--link"
						onClick={() => onOpenFile(path)}
					>
						{path}
					</button>
				) : (
					<span className="acp-diff__head-path select-text cursor-text">
						{path}
					</span>
				)}
				<span className="acp-diff__head-stat">
					<span className="plus">+{plus}</span>{" "}
					<span className="minus">−{minus}</span>
				</span>
			</div>
			<div className="acp-diff__body">
				{lines.map((line, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: diff lines have no stable id
						key={`l-${i}`}
						className="acp-diff__line"
						data-kind={line.kind}
					>
						<span className="acp-diff__line-num">{line.ln ?? ""}</span>
						<span className="acp-diff__line-mark" aria-hidden>
							{line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
						</span>
						<span className="acp-diff__line-text select-text cursor-text">
							{line.text}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
