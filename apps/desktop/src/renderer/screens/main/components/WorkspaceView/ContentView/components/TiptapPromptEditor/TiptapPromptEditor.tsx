import {
	usePromptInputAttachments,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { type Editor, Extension } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { HardBreak } from "@tiptap/extension-hard-break";
import { History } from "@tiptap/extension-history";
import { Paragraph } from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import { Text } from "@tiptap/extension-text";
import { PluginKey } from "@tiptap/pm/state";
import { EditorContent, useEditor } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";

const slashSuggestionKey = new PluginKey("slashCommandSuggestion");
const mentionSuggestionKey = new PluginKey("fileMentionSuggestion");

import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { resolveHotkeyFromEvent } from "renderer/hotkeys";
import { FileIcon } from "renderer/lib/fileIcons";
import { useTranslation } from "renderer/providers/I18nProvider";
import { FileMentionNode } from "./FileMentionNode";
import { parseTextToEditorContent } from "./parseTextToEditorContent";
import { SlashCommandMenu } from "./SlashCommandMenu";
import { SlashCommandNode } from "./SlashCommandNode";
import { serializeEditorToText } from "./serializeEditorToText";
import { shouldInsertTriggerSeparator } from "./shouldInsertTriggerSeparator";
import {
	type ComposerSlashCommand,
	filterSlashCommands,
	resolveSlashCommandArgumentOptions,
} from "./useSlashCommands";

type FileResult = { id: string; name: string; relativePath: string };
type SearchFilesFn = (query: string) => Promise<FileResult[]>;

type SlashMenuState = {
	commands: ComposerSlashCommand[];
	selectedIndex: number;
	tiptapCommand: (props: { cmd: ComposerSlashCommand }) => void;
};

type MentionState = {
	query: string;
	selectedIndex: number;
	tiptapCommand: (props: { path: string }) => void;
	clientRect: (() => DOMRect | null) | null;
};

export interface TiptapPromptEditorProps {
	cwd: string;
	searchFiles: SearchFilesFn;
	slashCommands: ComposerSlashCommand[];
	placeholder?: string;
	className?: string;
	focusShortcutText?: string;
	disabled?: boolean;
	/**
	 * Optional paste handler for contexts that only accept a subset of files.
	 * Return true only when the files were handled and the browser paste should
	 * be suppressed.
	 */
	onPasteFiles?: (files: File[]) => boolean;
}

export interface TiptapPromptEditorHandle {
	insertTrigger(trigger: "/" | "@"): void;
	focus(): void;
}

function getDirectoryPath(relativePath: string): string {
	const lastSlash = relativePath.lastIndexOf("/");
	if (lastSlash === -1) return "";
	return relativePath.slice(0, lastSlash);
}

export const TiptapPromptEditor = forwardRef<
	TiptapPromptEditorHandle,
	TiptapPromptEditorProps
>(function TiptapPromptEditor(
	{
		cwd,
		searchFiles,
		slashCommands,
		placeholder,
		className,
		focusShortcutText,
		disabled = false,
		onPasteFiles,
	},
	ref,
) {
	const { t } = useTranslation();
	const resolvedPlaceholder = placeholder ?? t("chatInput.placeholder");
	const placeholderRef = useRef(resolvedPlaceholder);
	placeholderRef.current = resolvedPlaceholder;
	const controller = usePromptInputController();
	const attachments = usePromptInputAttachments();

	// Stable refs to avoid stale closures in Tiptap extension callbacks
	const slashCommandsRef = useRef(slashCommands);
	slashCommandsRef.current = slashCommands;
	const attachmentsRef = useRef(attachments);
	attachmentsRef.current = attachments;
	const onPasteFilesRef = useRef(onPasteFiles);
	onPasteFilesRef.current = onPasteFiles;
	const controllerRef = useRef(controller);
	controllerRef.current = controller;

	// Track value last set FROM the editor → controller to break feedback loops.
	// Seed it from the provider so useEditor can render restored drafts on its
	// first paint without waiting for the external-sync effect.
	const initialControllerValueRef = useRef(controller.textInput.value);
	const lastEditorSyncedValue = useRef(initialControllerValueRef.current);

	// IME composition guard (prevents submit while CJK input is pending)
	const isComposingRef = useRef(false);

	// Track editor focus to show/hide the keyboard shortcut hint
	const [isFocused, setIsFocused] = useState(false);

	// Track chip interaction so editor selection/focus remains consistent.
	const [, setChipHovered] = useState(false);
	const [, setChipArgFocused] = useState(false);
	const [, setChipNodeSelected] = useState(false);

	// ── Slash command suggestion state ──────────────────────────────────────
	const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
	const slashMenuRef = useRef(slashMenu);
	slashMenuRef.current = slashMenu;
	// True only when the menu is visible (has ≥1 matching commands) — used to
	// guard the Enter key handler so zero-match "/" doesn't block form submit.
	const isSlashOpenRef = useRef(false);

	// ── File mention suggestion state ────────────────────────────────────────
	const [mentionState, setMentionState] = useState<MentionState | null>(null);
	const mentionStateRef = useRef(mentionState);
	mentionStateRef.current = mentionState;

	// Virtual anchor div for positioning the mention popover at the @ cursor
	const mentionAnchorRef = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		const el = mentionAnchorRef.current;
		if (!el || !mentionState?.clientRect) return;
		const rect = mentionState.clientRect();
		if (!rect) return;
		el.style.left = `${rect.left}px`;
		el.style.top = `${rect.top}px`;
		el.style.width = `${rect.width}px`;
		el.style.height = `${rect.height}px`;
	}, [mentionState]);

	const debouncedMentionQuery = useDebouncedValue(
		mentionState?.query ?? "",
		120,
	);
	const isMentionVisible = mentionState !== null;
	const [fileResults, setFileResults] = useState<FileResult[]>([]);
	const [isSearchingFiles, setIsSearchingFiles] = useState(false);
	const [fileSearchError, setFileSearchError] = useState(false);
	useEffect(() => {
		if (!isMentionVisible || !cwd) return;
		let cancelled = false;
		setFileResults([]);
		setIsSearchingFiles(true);
		setFileSearchError(false);
		searchFiles(debouncedMentionQuery)
			.then((results) => {
				if (!cancelled) setFileResults(results);
			})
			.catch(() => {
				if (!cancelled) {
					setFileResults([]);
					setFileSearchError(true);
				}
			})
			.finally(() => {
				if (!cancelled) setIsSearchingFiles(false);
			});
		return () => {
			cancelled = true;
		};
	}, [debouncedMentionQuery, cwd, isMentionVisible, searchFiles]);

	const mentionFiles: FileResult[] = isMentionVisible ? fileResults : [];
	const mentionFilesRef = useRef(mentionFiles);
	mentionFilesRef.current = mentionFiles;

	// Clamp selectedIndex when file results shrink
	useEffect(() => {
		if (!mentionState || mentionFiles.length === 0) return;
		const max = mentionFiles.length - 1;
		if (mentionState.selectedIndex > max) {
			setMentionState((prev) =>
				prev ? { ...prev, selectedIndex: max } : null,
			);
		}
	}, [mentionFiles.length, mentionState]);

	// ── Build editor ─────────────────────────────────────────────────────────
	const editor = useEditor({
		immediatelyRender: false,
		content: initialControllerValueRef.current
			? parseTextToEditorContent(initialControllerValueRef.current)
			: undefined,

		onFocus: () => setIsFocused(true),
		onBlur: () => setIsFocused(false),

		extensions: [
			Document,
			Text,
			Paragraph,
			HardBreak,
			History,

			// The editor instance is intentionally stable while the ACP session changes.
			// Read the current label through a ref so the extension does not retain the
			// first render's status (for example, "Session unavailable").
			Placeholder.configure({ placeholder: () => placeholderRef.current }),

			FileMentionNode,
			SlashCommandNode,

			// Chat-input keyboard shortcuts
			Extension.create({
				name: "chatInputKeyboard",
				addKeyboardShortcuts() {
					return {
						Enter: () => {
							// Guard: IME composition in progress
							if (isComposingRef.current) return false;
							// Guard: a suggestion menu is open and handling this key
							if (isSlashOpenRef.current) return false;
							if (mentionStateRef.current !== null) return false;
							// Find the enclosing form and submit it
							const dom = this.editor.view.dom;
							const form = dom.closest("form");
							if (!form) return false;
							const submitBtn = form.querySelector<HTMLButtonElement>(
								'button[type="submit"]',
							);
							// If the submit button is disabled, consume key but don't submit
							if (submitBtn?.disabled) return true;
							form.requestSubmit();
							return true;
						},

						"Shift-Enter": () => {
							return this.editor.commands.setHardBreak();
						},

						Backspace: () => {
							const { state } = this.editor;
							// ProseMirror's base keymap can leave the final text character in
							// place in contenteditable implementations that do not emit a
							// native beforeinput deletion. Handle that boundary explicitly.
							const { $from, empty } = state.selection;
							if (
								empty &&
								state.doc.textContent.length === 1 &&
								$from.parentOffset === 1
							) {
								return this.editor.commands.clearContent();
							}

							// Only remove attachment when editor is completely empty
							const para = state.doc.firstChild;
							const docIsEmpty =
								state.doc.childCount === 1 &&
								para !== null &&
								para.childCount === 0;
							if (!docIsEmpty) return false;
							const last = attachmentsRef.current.files.at(-1);
							if (last) {
								attachmentsRef.current.remove(last.id);
								return true;
							}
							return false;
						},
					};
				},
			}),

			// Slash command suggestion
			Extension.create({
				name: "slashCommand",
				addProseMirrorPlugins() {
					return [
						Suggestion({
							pluginKey: slashSuggestionKey,
							editor: this.editor,
							char: "/",
							allowSpaces: false,

							// Allow "/" at the start of a paragraph or after whitespace/atom
							// (same logic as the @ mention) — but never mid-word.
							allow: ({ state, range }) => {
								const $pos = state.doc.resolve(range.from);
								if ($pos.parentOffset === 0) return true;
								const textBefore = $pos.parent.textBetween(
									0,
									$pos.parentOffset,
									"\0",
									" ",
								);
								const charBefore = textBefore.slice(-1);
								return charBefore === " " || charBefore === "\n";
							},

							items: ({ query }: { query: string }) =>
								filterSlashCommands(
									slashCommandsRef.current,
									query.toLowerCase(),
								),

							render: () => ({
								onStart(props: {
									items: ComposerSlashCommand[];
									command: (p: { cmd: ComposerSlashCommand }) => void;
								}) {
									setSlashMenu({
										commands: props.items,
										selectedIndex: 0,
										tiptapCommand: props.command,
									});
								},
								onUpdate(props: {
									items: ComposerSlashCommand[];
									command: (p: { cmd: ComposerSlashCommand }) => void;
								}) {
									setSlashMenu((prev) =>
										prev
											? {
													...prev,
													commands: props.items,
													tiptapCommand: props.command,
													selectedIndex: Math.min(
														prev.selectedIndex,
														Math.max(0, props.items.length - 1),
													),
												}
											: null,
									);
								},
								onKeyDown({ event }: { event: KeyboardEvent }) {
									const menu = slashMenuRef.current;
									if (!menu || menu.commands.length === 0) return false;

									if (event.key === "Escape") {
										setSlashMenu(null);
										return true;
									}
									if (event.key === "ArrowUp") {
										setSlashMenu((prev) =>
											prev
												? {
														...prev,
														selectedIndex:
															prev.selectedIndex <= 0
																? prev.commands.length - 1
																: prev.selectedIndex - 1,
													}
												: null,
										);
										return true;
									}
									if (event.key === "ArrowDown") {
										setSlashMenu((prev) =>
											prev
												? {
														...prev,
														selectedIndex:
															prev.selectedIndex >= prev.commands.length - 1
																? 0
																: prev.selectedIndex + 1,
													}
												: null,
										);
										return true;
									}
									if (event.key === "Enter") {
										const cmd = menu.commands[menu.selectedIndex];
										if (cmd) menu.tiptapCommand({ cmd });
										return true;
									}
									return false;
								},
								onExit() {
									setSlashMenu(null);
								},
							}),

							command({
								editor: ed,
								range,
								props,
							}: {
								editor: Editor;
								range: { from: number; to: number };
								props: { cmd: ComposerSlashCommand };
							}) {
								// Insert the chip; the chip's input auto-focuses so the
								// user can type arguments directly inside it.
								const cmd = props.cmd;
								const argumentOptions = resolveSlashCommandArgumentOptions(
									cmd,
									[],
								);
								ed.chain()
									.deleteRange(range)
									.insertContentAt(range.from, {
										type: "slash-command",
										attrs: {
											name: cmd.name,
											argumentHint: cmd.argumentHint,
											argumentOptions,
										},
									})
									.run();
							},
						}),
					];
				},
			}),

			// File mention suggestion
			Extension.create({
				name: "fileMention",
				addProseMirrorPlugins() {
					return [
						Suggestion({
							pluginKey: mentionSuggestionKey,
							editor: this.editor,
							char: "@",
							allowSpaces: false,

							// Only trigger @ at start of paragraph or after whitespace/atom
							allow: ({ state, range }) => {
								const $pos = state.doc.resolve(range.from);
								if ($pos.parentOffset === 0) return true;
								// textBetween with leafText=" " treats atom nodes (chips) as spaces
								const textBefore = $pos.parent.textBetween(
									0,
									$pos.parentOffset,
									"\0",
									" ",
								);
								const charBefore = textBefore.slice(-1);
								return charBefore === " " || charBefore === "\n";
							},

							// Items managed in React state; return empty here
							items: () => [] as FileResult[],

							render: () => ({
								onStart(props: {
									query: string;
									command: (p: { path: string }) => void;
									clientRect?: (() => DOMRect | null) | null;
								}) {
									setMentionState({
										query: props.query,
										selectedIndex: 0,
										tiptapCommand: props.command,
										clientRect: props.clientRect ?? null,
									});
								},
								onUpdate(props: {
									query: string;
									command: (p: { path: string }) => void;
									clientRect?: (() => DOMRect | null) | null;
								}) {
									setMentionState((prev) =>
										prev
											? {
													...prev,
													query: props.query,
													selectedIndex: 0,
													tiptapCommand: props.command,
													clientRect: props.clientRect ?? null,
												}
											: null,
									);
								},
								onKeyDown({ event }: { event: KeyboardEvent }) {
									const mention = mentionStateRef.current;
									const files = mentionFilesRef.current;
									if (!mention) return false;

									if (event.key === "Escape") {
										setMentionState(null);
										return true;
									}
									if (event.key === "ArrowUp") {
										setMentionState((prev) =>
											prev
												? {
														...prev,
														selectedIndex:
															prev.selectedIndex <= 0
																? Math.max(0, files.length - 1)
																: prev.selectedIndex - 1,
													}
												: null,
										);
										return true;
									}
									if (event.key === "ArrowDown") {
										setMentionState((prev) =>
											prev
												? {
														...prev,
														selectedIndex:
															files.length === 0
																? 0
																: prev.selectedIndex >= files.length - 1
																	? 0
																	: prev.selectedIndex + 1,
													}
												: null,
										);
										return true;
									}
									if (event.key === "Enter" || event.key === "Tab") {
										const file = files[mention.selectedIndex];
										if (file) {
											mention.tiptapCommand({ path: file.relativePath });
											return true;
										}
										// No results — close the popup and consume the event
										setMentionState(null);
										return true;
									}
									return false;
								},
								onExit() {
									setMentionState(null);
								},
							}),

							command({
								editor: ed,
								range,
								props,
							}: {
								editor: Editor;
								range: { from: number; to: number };
								props: { path: string };
							}) {
								ed.chain()
									.deleteRange(range)
									.insertContentAt(range.from, [
										{ type: "file-mention", attrs: { path: props.path } },
										{ type: "text", text: " " },
									])
									.run();
							},
						}),
					];
				},
			}),
		],

		editorProps: {
			attributes: {
				"data-slot": "input-group-control",
				class: "tiptap-chat-input focus-visible:outline-none",
			},

			handleDOMEvents: {
				compositionstart: () => {
					isComposingRef.current = true;
					return false;
				},
				compositionend: () => {
					isComposingRef.current = false;
					return false;
				},
				keydown: (_view, event) => {
					// Keep bare Cmd/Ctrl+Arrow line-nav inside the editor, but let chords
					// that resolve to a real hotkey (e.g. ⌘⌥←/→ = prev/next tab) bubble to
					// react-hotkeys-hook instead of the editor swallowing them.
					if (
						(event.key === "ArrowLeft" || event.key === "ArrowRight") &&
						(event.metaKey || event.ctrlKey) &&
						resolveHotkeyFromEvent(event) === null
					) {
						event.stopPropagation();
					}
					return false;
				},
			},

			handlePaste: (_view, event) => {
				const clipItems = event.clipboardData?.items;
				if (!clipItems) return false;
				const files = Array.from(clipItems)
					.filter((i) => i.kind === "file")
					.map((i) => i.getAsFile())
					.filter((f): f is File => f !== null);
				if (files.length > 0) {
					const handleFiles = onPasteFilesRef.current;
					if (handleFiles) {
						if (!handleFiles(files)) return false;
					} else {
						attachmentsRef.current.add(files);
					}
					event.preventDefault();
					return true;
				}
				return false;
			},
		},

		onUpdate: ({ editor: e }) => {
			const text = serializeEditorToText(e);
			lastEditorSyncedValue.current = text;
			controllerRef.current.textInput.setInput(text);
		},
	});

	useEffect(() => {
		editor?.setEditable(!disabled);
	}, [disabled, editor]);

	// Tiptap's placeholder decoration is calculated when the editor view updates;
	// changing an extension option alone does not cause that update. Dispatching a
	// metadata-only transaction refreshes the decoration without changing the
	// document or the user's draft.
	useEffect(() => {
		// Keep the dependency explicit for the prop-driven refresh. The ref is
		// also updated during render so the decoration callback never sees a
		// stale label before this effect runs.
		if (placeholderRef.current !== resolvedPlaceholder) {
			placeholderRef.current = resolvedPlaceholder;
		}
		if (!editor) return;
		editor.view.dispatch(editor.state.tr.setMeta("placeholder", true));
	}, [editor, resolvedPlaceholder]);

	useImperativeHandle(
		ref,
		() => ({
			focus: () => editor?.commands.focus("end"),
			insertTrigger: (trigger) => {
				if (!editor || disabled) return;
				const { $from } = editor.state.selection;
				const charBefore = $from.parent.textBetween(
					Math.max(0, $from.parentOffset - 1),
					$from.parentOffset,
				);
				const separator = shouldInsertTriggerSeparator(
					$from.nodeBefore,
					charBefore,
				);
				editor
					.chain()
					.focus()
					.insertContent(separator ? ` ${trigger}` : trigger)
					.run();
			},
		}),
		[disabled, editor],
	);

	// Register focus callback so controller.textInput.focus() targets the editor
	useEffect(() => {
		if (!editor) return;
		controller.__registerFocusCallback(() => {
			editor.commands.focus("end");
		});
		return () => {
			controller.__registerFocusCallback(null);
		};
	}, [controller, editor]);

	// Track chip node selection via ProseMirror transactions
	useEffect(() => {
		if (!editor) return;
		const update = () => {
			const { selection } = editor.state;
			const node = (selection as { node?: { type: { name: string } } }).node;
			setChipNodeSelected(node?.type?.name === "slash-command");
		};
		editor.on("selectionUpdate", update);
		return () => {
			editor.off("selectionUpdate", update);
		};
	}, [editor]);

	// Sync external controller.textInput.value changes → editor
	// e.g. when SlashCommandPreview.handleFieldChange sets a param value
	useEffect(() => {
		if (!editor) return;
		const externalText = controller.textInput.value;
		// Skip if the editor itself just produced this value
		if (externalText === lastEditorSyncedValue.current) return;
		const currentText = serializeEditorToText(editor);
		if (externalText === currentText) return;
		// Update editor without firing onUpdate (prevents loop)
		editor.commands.setContent(
			externalText
				? parseTextToEditorContent(externalText)
				: { type: "doc", content: [{ type: "paragraph" }] },
			{ emitUpdate: false },
		);
		lastEditorSyncedValue.current = externalText;
	}, [controller.textInput.value, editor]);

	const isSlashOpen = slashMenu !== null && slashMenu.commands.length > 0;
	isSlashOpenRef.current = isSlashOpen;
	const isMentionOpen = mentionState !== null;

	return (
		<>
			{/* Slash command menu popover — anchored to the full editor div */}
			<Popover open={isSlashOpen && isFocused}>
				<PopoverAnchor asChild>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: event delegation pattern for chip hover/focus detection */}
					<div
						role="presentation"
						className={cn(
							"relative w-full overflow-y-auto px-3 py-3 text-sm",
							"min-h-10 max-h-48",
							focusShortcutText && !isFocused && "pr-20",
							className,
						)}
						onMouseOver={(e) => {
							if (
								(e.target as Element).closest(
									"[data-node-type='slash-command']",
								)
							) {
								setChipHovered(true);
							}
						}}
						onMouseOut={(e) => {
							if (
								!(e.relatedTarget as Element | null)?.closest(
									"[data-node-type='slash-command']",
								)
							) {
								setChipHovered(false);
							}
						}}
						onFocus={(e) => {
							if (
								(e.target as Element).closest(
									"[data-node-type='slash-command']",
								)
							) {
								setChipArgFocused(true);
							}
						}}
						onBlur={(e) => {
							if (
								!(e.relatedTarget as Element | null)?.closest(
									"[data-node-type='slash-command']",
								)
							) {
								setChipArgFocused(false);
							}
						}}
					>
						{focusShortcutText && !isFocused && (
							<span className="pointer-events-none absolute top-0 right-3 flex h-full items-center text-xs text-fg-mute/50">
								{t("chatInput.focusHint", { shortcut: focusShortcutText })}
							</span>
						)}
						<EditorContent editor={editor} />
					</div>
				</PopoverAnchor>
				{isSlashOpen && slashMenu && (
					<SlashCommandMenu
						commands={slashMenu.commands}
						selectedIndex={slashMenu.selectedIndex}
						onSelect={(cmd) => slashMenu.tiptapCommand({ cmd })}
						onHover={(i) =>
							setSlashMenu((prev) =>
								prev ? { ...prev, selectedIndex: i } : null,
							)
						}
					/>
				)}
			</Popover>

			{/* File mention popover — anchored to the @ cursor via a virtual fixed div */}
			<Popover open={isMentionOpen && isFocused}>
				<PopoverAnchor asChild>
					<div
						ref={mentionAnchorRef}
						className="pointer-events-none fixed"
						aria-hidden="true"
					/>
				</PopoverAnchor>
				{isMentionOpen && (
					<PopoverContent
						side="top"
						align="start"
						sideOffset={4}
						className="w-80 p-0 text-xs"
						onOpenAutoFocus={(e) => e.preventDefault()}
						onCloseAutoFocus={(e) => e.preventDefault()}
						onMouseDown={(e) => e.preventDefault()}
					>
						<Command shouldFilter={false}>
							<CommandList className="max-h-[200px] [&::-webkit-scrollbar]:hidden">
								{mentionFiles.length === 0 && (
									<CommandEmpty className="px-2 py-3 text-left text-xs text-fg-mute">
										{isSearchingFiles
											? t("mention.searchingFiles")
											: fileSearchError
												? t("mention.fileSearchNotAvailable")
												: t("mention.noResults")}
									</CommandEmpty>
								)}
								{mentionFiles.length > 0 && (
									<CommandGroup heading={t("mention.filesHeading")}>
										{mentionFiles.map((file, idx) => {
											const dirPath = getDirectoryPath(file.relativePath);
											return (
												<CommandItem
													key={file.id}
													value={file.relativePath}
													className={cn(
														idx === (mentionState?.selectedIndex ?? -1) &&
															"bg-accent-tint",
													)}
													onSelect={() => {
														mentionState?.tiptapCommand({
															path: file.relativePath,
														});
													}}
												>
													<FileIcon
														fileName={file.name}
														className="size-3.5 shrink-0"
													/>
													<span className="truncate text-xs">{file.name}</span>
													{dirPath && (
														<span className="min-w-0 truncate font-mono text-xs text-fg-mute">
															{dirPath}
														</span>
													)}
												</CommandItem>
											);
										})}
									</CommandGroup>
								)}
							</CommandList>
						</Command>
					</PopoverContent>
				)}
			</Popover>
		</>
	);
});
