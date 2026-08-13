import type { ContentBlock, QueuedPrompt } from "@superset/session-protocol";
import {
	type RefCallback,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

interface AcpComposerQueueProps {
	queued: QueuedPrompt[];
	onRemove(queueId: string): Promise<void>;
	onReorder(orderedIds: string[]): Promise<void>;
	onEdit(queueId: string, blocks: ContentBlock[]): Promise<void>;
}

/** Reads the text out of a queued prompt for display / inline edit. Images
 * and other non-text blocks are preserved verbatim on save. */
function draftFromPrompt(prompt: ContentBlock[]): string {
	return prompt
		.filter(
			(block): block is { type: "text"; text: string } => block.type === "text",
		)
		.map((block) => block.text)
		.join("\n");
}

function replaceTextBlocks(
	prompt: ContentBlock[],
	nextText: string,
): ContentBlock[] {
	const nonText = prompt.filter((block) => block.type !== "text");
	const trimmed = nextText.trim();
	return trimmed ? [{ type: "text", text: nextText }, ...nonText] : nonText;
}

export function AcpComposerQueue({
	queued,
	onRemove,
	onReorder,
	onEdit,
}: AcpComposerQueueProps) {
	const dragIdRef = useRef<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingDraft, setEditingDraft] = useState("");

	// Cancel edit if the queued row disappears (drain / remove).
	useEffect(() => {
		if (!editingId) return;
		if (!queued.some((entry) => entry.queueId === editingId)) {
			setEditingId(null);
		}
	}, [editingId, queued]);

	const startEdit = useCallback((entry: QueuedPrompt) => {
		setEditingId(entry.queueId);
		setEditingDraft(draftFromPrompt(entry.prompt));
	}, []);

	const commitEdit = useCallback(async () => {
		const activeId = editingId;
		if (!activeId) return;
		const entry = queued.find((row) => row.queueId === activeId);
		if (!entry) {
			setEditingId(null);
			return;
		}
		const nextBlocks = replaceTextBlocks(entry.prompt, editingDraft);
		setEditingId(null);
		if (nextBlocks.length === 0) {
			await onRemove(activeId);
			return;
		}
		await onEdit(activeId, nextBlocks);
	}, [editingDraft, editingId, onEdit, onRemove, queued]);

	const cancelEdit = useCallback(() => {
		setEditingId(null);
	}, []);

	// Focus + select the edit textarea when it mounts, without the `autoFocus`
	// attribute (biome's a11y rule bans it — it steals focus on page load).
	const focusOnMount: RefCallback<HTMLTextAreaElement> = useCallback((node) => {
		if (!node) return;
		node.focus();
		node.select();
	}, []);

	const onDragStart = useCallback(
		(id: string) => (event: React.DragEvent<HTMLLIElement>) => {
			dragIdRef.current = id;
			event.dataTransfer.effectAllowed = "move";
			try {
				event.dataTransfer.setData("text/plain", id);
			} catch {
				// Some browsers still reject setData on drag start; the ref is
				// what we actually rely on, so tolerate the failure.
			}
		},
		[],
	);

	const onDragOver = useCallback(
		(id: string) => (event: React.DragEvent<HTMLLIElement>) => {
			event.preventDefault();
			event.dataTransfer.dropEffect = "move";
			if (dragIdRef.current === null || dragIdRef.current === id) return;
			setDragOverId(id);
		},
		[],
	);

	const onDrop = useCallback(
		(id: string) => async (event: React.DragEvent<HTMLLIElement>) => {
			event.preventDefault();
			const from = dragIdRef.current;
			dragIdRef.current = null;
			setDragOverId(null);
			if (!from || from === id) return;
			const fromIdx = queued.findIndex((entry) => entry.queueId === from);
			const toIdx = queued.findIndex((entry) => entry.queueId === id);
			if (fromIdx < 0 || toIdx < 0) return;
			const next = queued.map((entry) => entry.queueId);
			const [moved] = next.splice(fromIdx, 1);
			next.splice(toIdx, 0, moved);
			await onReorder(next);
		},
		[onReorder, queued],
	);

	const onDragEnd = useCallback(() => {
		dragIdRef.current = null;
		setDragOverId(null);
	}, []);

	const summary = useMemo(
		() => `${queued.length} queued follow-up${queued.length === 1 ? "" : "s"}`,
		[queued.length],
	);

	return (
		<section
			className="acp-pane__composer-queue"
			aria-label="Follow-up prompt queue"
		>
			<header className="acp-pane__composer-queue-hd">
				<span className="acp-pane__composer-queue-title">Follow-ups</span>
				<span className="acp-pane__composer-queue-count">{summary}</span>
			</header>
			<ol className="acp-pane__composer-queue-list">
				{queued.map((entry, index) => {
					const isEditing = editingId === entry.queueId;
					const preview = draftFromPrompt(entry.prompt) || "(image only)";
					return (
						<li
							key={entry.queueId}
							className={`acp-pane__composer-queue-chip${
								dragOverId === entry.queueId ? " is-drop-target" : ""
							}${isEditing ? " is-editing" : ""}`}
							draggable={!isEditing}
							onDragStart={onDragStart(entry.queueId)}
							onDragOver={onDragOver(entry.queueId)}
							onDrop={onDrop(entry.queueId)}
							onDragEnd={onDragEnd}
						>
							<span
								className="acp-pane__composer-queue-grip"
								aria-hidden
								title="Drag to reorder"
							>
								⋮⋮
							</span>
							<span className="acp-pane__composer-queue-idx" aria-hidden>
								{String(index + 1).padStart(2, "0")}
							</span>
							{isEditing ? (
								<textarea
									ref={focusOnMount}
									className="acp-pane__composer-queue-edit select-text cursor-text"
									value={editingDraft}
									rows={2}
									onChange={(event) => setEditingDraft(event.target.value)}
									onBlur={() => void commitEdit()}
									onKeyDown={(event) => {
										if (event.key === "Escape") {
											event.preventDefault();
											cancelEdit();
										} else if (
											event.key === "Enter" &&
											(event.metaKey || event.ctrlKey)
										) {
											event.preventDefault();
											void commitEdit();
										}
									}}
								/>
							) : (
								<button
									type="button"
									className="acp-pane__composer-queue-text select-text cursor-text"
									onDoubleClick={() => startEdit(entry)}
									title="Double-click to edit"
								>
									{preview}
								</button>
							)}
							<span className="acp-pane__composer-queue-actions">
								<button
									type="button"
									className="acp-pane__composer-queue-btn"
									disabled={isEditing}
									onClick={() => startEdit(entry)}
									aria-label="Edit"
									title="Edit"
								>
									✎
								</button>
								<button
									type="button"
									className="acp-pane__composer-queue-btn acp-pane__composer-queue-btn--danger"
									disabled={isEditing}
									onClick={() => {
										void onRemove(entry.queueId);
									}}
									aria-label="Remove from queue"
									title="Remove"
								>
									×
								</button>
							</span>
						</li>
					);
				})}
			</ol>
		</section>
	);
}
