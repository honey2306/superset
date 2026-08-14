import type {
	AvailableCommand,
	ContentBlock,
	QueuedPrompt,
	SessionConfigOption,
	SessionStatus,
} from "@superset/session-protocol";
import {
	PromptInputProvider,
	usePromptInputAttachments,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import { ArrowUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	TiptapPromptEditor,
	type TiptapPromptEditorHandle,
} from "renderer/screens/main/components/WorkspaceView/ContentView/components/TiptapPromptEditor";
import { AcpComposerQueue } from "./AcpComposerQueue";
import {
	acpCommandsToComposerCommands,
	clearAcpComposerDraft,
	getAcpComposerDraft,
	isAcpImageAttachment,
	resolveAcpConfigCommand,
	resolveCanEnqueue,
	resolveComposerDisabled,
	resolveComposerMode,
	resolveShowCancel,
	setAcpComposerDraft,
	shouldClearSubmittedDraft,
	shouldRestoreSubmittedDraft,
	toAcpImageContentBlock,
} from "./acpComposerState";

interface AcpComposerProps {
	sessionId: string;
	status: SessionStatus | undefined;
	isLoading: boolean;
	isCancelling: boolean;
	workspaceId: string;
	cwd: string;
	commands: AvailableCommand[] | null | undefined;
	configOptions: SessionConfigOption[];
	queuedPrompts: QueuedPrompt[];
	searchFiles(
		query: string,
	): Promise<{ id: string; name: string; relativePath: string }[]>;
	onSetMode(modeId: string): Promise<void>;
	onSetConfigOption(configId: string, value: string | boolean): Promise<void>;
	/** Idle path: run the prompt now. */
	onSubmit(blocks: ContentBlock[]): Promise<void>;
	/** Streaming path: append to the follow-up queue. */
	onEnqueue(blocks: ContentBlock[]): Promise<void>;
	onRemoveQueued(queueId: string): Promise<void>;
	onReorderQueue(orderedIds: string[]): Promise<void>;
	onEditQueued(queueId: string, blocks: ContentBlock[]): Promise<void>;
	onCancel?(): void;
	/** Scrolls the timeline to the last user message. Hidden when undefined. */
	onJumpToLastUserMessage?(): void;
}

export function AcpComposer(props: AcpComposerProps) {
	return (
		<PromptInputProvider>
			<AcpComposerInner {...props} />
		</PromptInputProvider>
	);
}

function AcpComposerInner({
	sessionId,
	status,
	isLoading,
	isCancelling,
	cwd,
	commands,
	configOptions,
	queuedPrompts,
	searchFiles,
	onSetMode,
	onSetConfigOption,
	onSubmit,
	onEnqueue,
	onRemoveQueued,
	onReorderQueue,
	onEditQueued,
	onCancel,
	onJumpToLastUserMessage,
}: AcpComposerProps) {
	const controller = usePromptInputController();
	const attachments = usePromptInputAttachments();
	const editorRef = useRef<TiptapPromptEditorHandle>(null);
	const [isAdmitting, setIsAdmitting] = useState(false);
	const [admitError, setAdmitError] = useState<string | null>(null);
	const submittedDraftRef = useRef("");
	const currentDraftRef = useRef(controller.textInput.value);
	const skipInitialDraftSyncRef = useRef(false);
	const controllerRef = useRef(controller);
	controllerRef.current = controller;
	currentDraftRef.current = controller.textInput.value;
	useEffect(() => {
		const savedDraft = getAcpComposerDraft(sessionId);
		if (!savedDraft || controllerRef.current.textInput.value) return;
		skipInitialDraftSyncRef.current = true;
		controllerRef.current.textInput.setInput(savedDraft);
		currentDraftRef.current = savedDraft;
	}, [sessionId]);
	useEffect(() => {
		if (skipInitialDraftSyncRef.current) {
			skipInitialDraftSyncRef.current = false;
			return;
		}
		setAcpComposerDraft(sessionId, controller.textInput.value);
	}, [controller.textInput.value, sessionId]);
	const disabled = resolveComposerDisabled({ status, isLoading, isAdmitting });
	const mode = resolveComposerMode(status);
	const canEnqueue = resolveCanEnqueue(status);
	const showCancel = resolveShowCancel(status) && !!onCancel;
	const slashCommands = useMemo(
		() => acpCommandsToComposerCommands(commands, configOptions),
		[commands, configOptions],
	);
	// A single submit handler routes the draft to `onSubmit` / `onEnqueue` —
	// same clear-on-success and restore-on-failure semantics across every
	// path so composer state stays consistent.
	const submitWith = useCallback(
		async (
			deliver: (blocks: ContentBlock[]) => Promise<void>,
			gate: boolean,
		) => {
			const currentDraft = controller.textInput.value;
			const text = currentDraft.trim();
			const submittedAttachments =
				attachments.files.filter(isAcpImageAttachment);
			if ((!text && submittedAttachments.length === 0) || !gate || isAdmitting)
				return;
			submittedDraftRef.current = currentDraft;
			let wasOptimisticallyCleared = false;
			const clearSubmittedDraft = () => {
				if (
					!shouldClearSubmittedDraft(
						currentDraftRef.current,
						submittedDraftRef.current,
					)
				)
					return;
				controller.textInput.clear();
				currentDraftRef.current = "";
				clearAcpComposerDraft(sessionId);
				wasOptimisticallyCleared = true;
			};
			setIsAdmitting(true);
			setAdmitError(null);
			try {
				const localCommand = resolveAcpConfigCommand(
					text,
					slashCommands,
					submittedAttachments.length > 0,
				);
				if (localCommand) {
					clearSubmittedDraft();
					if (localCommand.type === "set_mode") {
						await onSetMode(localCommand.value);
					} else {
						await onSetConfigOption(localCommand.configId, localCommand.value);
					}
					return;
				}
				const imageBlocks = await Promise.all(
					submittedAttachments.map((attachment) =>
						toAcpImageContentBlock(attachment),
					),
				);
				const blocks: ContentBlock[] = [
					...(text ? [{ type: "text" as const, text }] : []),
					...imageBlocks,
				];
				clearSubmittedDraft();
				await deliver(blocks);
				for (const attachment of submittedAttachments) {
					attachments.remove(attachment.id);
				}
			} catch (err) {
				if (
					shouldRestoreSubmittedDraft(
						currentDraftRef.current,
						wasOptimisticallyCleared,
					)
				) {
					controller.textInput.setInput(submittedDraftRef.current);
					currentDraftRef.current = submittedDraftRef.current;
					setAcpComposerDraft(sessionId, submittedDraftRef.current);
				}
				setAdmitError(err instanceof Error ? err.message : "Failed to send");
			} finally {
				setIsAdmitting(false);
			}
		},
		[
			attachments,
			controller.textInput,
			isAdmitting,
			onSetConfigOption,
			onSetMode,
			sessionId,
			slashCommands,
		],
	);
	const handleSubmit = useCallback(
		() =>
			mode === "streaming"
				? submitWith(onEnqueue, canEnqueue)
				: submitWith(onSubmit, canEnqueue),
		[canEnqueue, mode, onEnqueue, onSubmit, submitWith],
	);
	const imageAttachments = attachments.files.filter(isAcpImageAttachment);
	const handlePastedFiles = useCallback(
		(files: File[]) => {
			const images = files.filter((file) => file.type.startsWith("image/"));
			if (images.length === 0) return false;
			attachments.add(images);
			return true;
		},
		[attachments],
	);
	const placeholder =
		status === "offline" || status === "dead"
			? "Session unavailable"
			: mode === "streaming"
				? "Type a follow-up — enter to queue"
				: "Message agent…";
	const isDraftEmpty =
		!controller.textInput.value.trim() && imageAttachments.length === 0;
	return (
		<div className="acp-pane__composer">
			{queuedPrompts.length > 0 && (
				<AcpComposerQueue
					queued={queuedPrompts}
					onRemove={onRemoveQueued}
					onReorder={onReorderQueue}
					onEdit={onEditQueued}
				/>
			)}
			{admitError && (
				<p className="acp-pane__composer-error select-text cursor-text">
					{admitError}
				</p>
			)}
			<form
				className="acp-pane__composer-box"
				onSubmit={(event) => {
					event.preventDefault();
					void handleSubmit();
				}}
			>
				{imageAttachments.length > 0 && (
					<ul
						className="acp-pane__composer-attachments"
						aria-label="Pasted images"
					>
						{imageAttachments.map((attachment) => (
							<li className="acp-pane__composer-attachment" key={attachment.id}>
								<img
									alt={attachment.filename || "Pasted image"}
									src={attachment.url}
								/>
								<button
									type="button"
									aria-label={`Remove ${attachment.filename || "pasted image"}`}
									disabled={disabled}
									onClick={() => attachments.remove(attachment.id)}
								>
									×
								</button>
							</li>
						))}
					</ul>
				)}
				<div className="acp-pane__composer-row">
					<span className="acp-pane__composer-glyph" aria-hidden>
						›
					</span>
					<TiptapPromptEditor
						ref={editorRef}
						cwd={cwd}
						searchFiles={searchFiles}
						slashCommands={slashCommands}
						placeholder={placeholder}
						disabled={disabled}
						onPasteFiles={handlePastedFiles}
						className="acp-pane__composer-editor"
					/>
					{onJumpToLastUserMessage && (
						<button
							type="button"
							className="acp-pane__composer-jump-prompt"
							aria-label="Jump to my last message"
							title="Jump to my last message"
							onClick={onJumpToLastUserMessage}
						>
							<ArrowUp aria-hidden />
						</button>
					)}
					{mode === "streaming" && showCancel && (
						<button
							type="button"
							className="acp-pane__composer-cancel"
							disabled={isCancelling}
							onClick={onCancel}
						>
							{isCancelling ? "Cancelling…" : "Cancel"}
						</button>
					)}
					{mode === "idle" && (
						<button
							type="submit"
							className="acp-pane__composer-send"
							disabled={disabled || isDraftEmpty || !canEnqueue}
						>
							{isAdmitting ? (
								"Sending"
							) : (
								<>
									Send <span className="acp-pane__composer-send-kbd">⏎</span>
								</>
							)}
						</button>
					)}
					{/* Streaming mode: Enter submits the form (→ enqueue), so no
						 visible "Queue" button is needed. The queue chip list above
						 appears automatically when there is anything queued. */}
				</div>
			</form>
		</div>
	);
}
