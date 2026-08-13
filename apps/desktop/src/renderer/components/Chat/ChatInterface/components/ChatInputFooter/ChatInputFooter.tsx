import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	type PromptInputMessage,
	usePromptInputController,
} from "@superset/ui/ai-elements/prompt-input";
import type { ThinkingLevel } from "@superset/ui/ai-elements/thinking-toggle";
import type { ChatStatus, FileUIPart } from "ai";
import type React from "react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { useFocusPromptOnPane } from "renderer/components/Chat/ChatInterface/hooks/useFocusPromptOnPane";
import { useHostWorkspaceIdForCwd } from "renderer/components/Chat/utils/useHostWorkspaceIdForCwd";
import { hostServiceTrpc } from "renderer/lib/host-service-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { SlashCommand } from "../../hooks/useSlashCommands";
import type { ModelOption, PermissionMode } from "../../types";
import { TiptapPromptEditor } from "../TiptapPromptEditor";
import { ChatComposerControls } from "./components/ChatComposerControls";
import { ChatInputDropZone } from "./components/ChatInputDropZone";
import { FileDropOverlay } from "./components/FileDropOverlay";
import { QuestionInputOverlay } from "./components/QuestionInputOverlay";
import { getErrorMessage } from "./utils/getErrorMessage";

interface ChatInputFooterProps {
	cwd: string;
	isFocused: boolean;
	error: unknown;
	canAbort: boolean;
	submitStatus?: ChatStatus;
	availableModels: ModelOption[];
	selectedModel: ModelOption | null;
	setSelectedModel: React.Dispatch<React.SetStateAction<ModelOption | null>>;
	modelSelectorOpen: boolean;
	setModelSelectorOpen: React.Dispatch<React.SetStateAction<boolean>>;
	permissionMode: PermissionMode;
	setPermissionMode: React.Dispatch<React.SetStateAction<PermissionMode>>;
	thinkingLevel: ThinkingLevel;
	setThinkingLevel: (level: ThinkingLevel) => void;
	slashCommands: SlashCommand[];
	submitDisabled?: boolean;
	renderAttachment?: (file: FileUIPart & { id: string }) => ReactNode;
	onSubmitStart?: () => void;
	onSubmitEnd?: () => void;
	onSend: (message: PromptInputMessage) => Promise<void> | void;
	onStop: (e: React.MouseEvent) => void;
	pendingQuestion?: {
		questionId: string;
		question: string;
		description?: string;
		options?: { label: string; description?: string }[];
	} | null;
	isQuestionSubmitting?: boolean;
	onQuestionRespond?: (questionId: string, answer: string) => Promise<void>;
	onQuestionCancel?: () => void;
}

export function ChatInputFooter({
	cwd,
	isFocused,
	error,
	canAbort,
	submitStatus,
	availableModels,
	selectedModel,
	setSelectedModel,
	modelSelectorOpen,
	setModelSelectorOpen,
	permissionMode,
	setPermissionMode,
	thinkingLevel,
	setThinkingLevel,
	slashCommands,
	submitDisabled,
	renderAttachment,
	onSubmitStart,
	onSubmitEnd,
	onSend,
	onStop,
	pendingQuestion,
	isQuestionSubmitting,
	onQuestionRespond,
	onQuestionCancel,
}: ChatInputFooterProps) {
	const { t } = useTranslation();
	useFocusPromptOnPane(isFocused);

	// Focus the prompt when the question overlay dismisses (pendingQuestion → null).
	// Uses rAF so the editor has time to mount, register its ref, and browser
	// focus-stealing from the unmounting overlay has settled.
	const { textInput } = usePromptInputController();
	const prevPendingQuestionRef = useRef(pendingQuestion);
	useEffect(() => {
		const prev = prevPendingQuestionRef.current;
		prevPendingQuestionRef.current = pendingQuestion;
		if (prev != null && pendingQuestion == null) {
			const id = requestAnimationFrame(() => textInput.focus());
			return () => cancelAnimationFrame(id);
		}
	}, [pendingQuestion, textInput]);

	const inputRootRef = useRef<HTMLDivElement>(null);
	const errorMessage = getErrorMessage(error);

	const trpcUtils = hostServiceTrpc.useUtils();
	const workspaceId = useHostWorkspaceIdForCwd(cwd);
	const searchFiles = useCallback(
		async (query: string) => {
			if (!workspaceId) return [];
			const results = await trpcUtils.chat.searchFiles.fetch({
				workspaceId,
				query,
				includeHidden: false,
				limit: 20,
			});
			return results.map((r) => ({
				id: r.id,
				name: r.name,
				relativePath: r.relativePath,
			}));
		},
		[trpcUtils, workspaceId],
	);
	const previewSlashCommand = useCallback(
		async (text: string) => {
			if (!workspaceId) return null;
			const result = await trpcUtils.chat.previewSlashCommand.fetch({
				workspaceId,
				text,
			});
			return result ?? null;
		},
		[trpcUtils, workspaceId],
	);

	const handleSend = useCallback(
		(message: PromptInputMessage) => onSend(message),
		[onSend],
	);

	return (
		<ChatInputDropZone className="relative bg-background px-4 pb-3 before:pointer-events-none before:absolute before:left-0 before:right-3 before:-top-8 before:h-8 before:bg-gradient-to-t before:from-background before:to-transparent">
			{(dragType) => (
				<div className="mx-auto w-full max-w-[680px]">
					{errorMessage && (
						<p
							role="alert"
							className="mb-3 select-text rounded-ds-3 border border-destructive/20 bg-danger-tint px-4 py-2 text-sm text-destructive"
						>
							{errorMessage}
						</p>
					)}
					{pendingQuestion && onQuestionRespond && onQuestionCancel ? (
						<QuestionInputOverlay
							question={pendingQuestion}
							isSubmitting={isQuestionSubmitting ?? false}
							onRespond={onQuestionRespond}
							onCancel={onQuestionCancel}
						/>
					) : (
						<div
							ref={inputRootRef}
							className={
								dragType === "path"
									? "relative opacity-50 transition-opacity"
									: "relative"
							}
						>
							<PromptInput
								className="[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]"
								onSubmitStart={onSubmitStart}
								onSubmitEnd={onSubmitEnd}
								onSubmit={handleSend}
								multiple
								maxFiles={5}
								maxFileSize={10 * 1024 * 1024}
								globalDrop
							>
								<FileDropOverlay visible={dragType === "files"} />
								<PromptInputAttachments>
									{renderAttachment ??
										((file) => <PromptInputAttachment data={file} />)}
								</PromptInputAttachments>
								<TiptapPromptEditor
									cwd={cwd}
									searchFiles={searchFiles}
									previewSlashCommand={previewSlashCommand}
									slashCommands={slashCommands}
									availableModels={availableModels}
									placeholder={t("chatInput.placeholder")}
								/>
								<ChatComposerControls
									availableModels={availableModels}
									selectedModel={selectedModel}
									setSelectedModel={setSelectedModel}
									modelSelectorOpen={modelSelectorOpen}
									setModelSelectorOpen={setModelSelectorOpen}
									permissionMode={permissionMode}
									setPermissionMode={setPermissionMode}
									thinkingLevel={thinkingLevel}
									setThinkingLevel={setThinkingLevel}
									canAbort={canAbort}
									submitStatus={submitStatus}
									submitDisabled={submitDisabled}
									onStop={onStop}
								/>
							</PromptInput>
						</div>
					)}
					<div className="py-1.5" />
				</div>
			)}
		</ChatInputDropZone>
	);
}
