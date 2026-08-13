import { ExploringGroup } from "@superset/ui/ai-elements/exploring-group";
import type { UIMessage } from "ai";
import { getToolName, isToolUIPart } from "ai";
import {
	AlertCircleIcon,
	FileIcon,
	FileSearchIcon,
	FolderTreeIcon,
	SearchIcon,
} from "lucide-react";
import type React from "react";
import { useCallback, useMemo } from "react";
import { openFileInPanes } from "renderer/lib/panes";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useTheme } from "renderer/stores";
import { READ_ONLY_TOOLS } from "../../constants";
import {
	getWorkspaceToolFilePath,
	normalizeWorkspaceFilePath,
} from "../../utils/file-paths";
import type { ToolPart } from "../../utils/tool-helpers";
import { getArgs, normalizeToolName } from "../../utils/tool-helpers";
import { ReadOnlyToolCall } from "../ReadOnlyToolCall";
import { ReasoningBlock } from "../ReasoningBlock";
import { ToolCallBlock } from "../ToolCallBlock";
import { StreamingMessageText } from "./components/StreamingMessageText";

interface MessagePartsRendererProps {
	parts: UIMessage["parts"];
	isLastAssistant: boolean;
	isStreaming: boolean;
	isInterrupted?: boolean;
	workspaceId?: string;
	workspaceCwd?: string;
	onAnswer?: (
		toolCallId: string,
		answers: Record<string, string>,
	) => Promise<void> | void;
}

export function MessagePartsRenderer({
	parts,
	isLastAssistant,
	isStreaming,
	isInterrupted,
	workspaceId,
	workspaceCwd,
	onAnswer,
}: MessagePartsRendererProps): React.ReactNode[] {
	const { t } = useTranslation();
	const theme = useTheme();
	const _handleLinkClick = useCallback(
		(_e: React.MouseEvent<HTMLAnchorElement>, _href: string) => {
			// Internal browser removed - links always open externally
		},
		[],
	);
	const openFileInPane = useCallback(
		(filePath: string) => {
			if (!workspaceId) return;
			const normalizedPath = normalizeWorkspaceFilePath({
				filePath,
				workspaceRoot: workspaceCwd,
			});
			if (!normalizedPath) return;
			openFileInPanes(workspaceId, { filePath: normalizedPath });
		},
		[workspaceCwd, workspaceId],
	);

	const components = useMemo(() => {
		// Internal browser removed - no custom link handling
		return undefined;
	}, []);
	const mermaidConfig = useMemo(
		() => ({
			config: {
				theme:
					theme?.type !== "light" ? ("dark" as const) : ("default" as const),
			},
		}),
		[theme?.type],
	);

	const renderParts = ({
		parts,
		isLastAssistant,
	}: {
		parts: UIMessage["parts"];
		isLastAssistant: boolean;
	}): React.ReactNode[] => {
		const nodes: React.ReactNode[] = [];
		let i = 0;

		while (i < parts.length) {
			const part = parts[i];

			if (part.type === "text") {
				nodes.push(
					<StreamingMessageText
						key={i}
						text={part.text}
						isAnimating={isLastAssistant && isStreaming}
						mermaid={mermaidConfig}
						components={components}
					/>,
				);
				i++;
				continue;
			}

			if ((part as { type: string }).type === "error") {
				const errorPart = part as unknown as { type: "error"; text: string };
				nodes.push(
					<div
						key={i}
						className="flex items-start gap-2 rounded-ds-3 border border-destructive/20 bg-danger-tint px-4 py-2 text-sm text-destructive"
					>
						<AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
						<span className="select-text">{errorPart.text}</span>
					</div>,
				);
				i++;
				continue;
			}

			if (part.type === "reasoning") {
				nodes.push(<ReasoningBlock key={i} reasoning={part.text} />);
				i++;
				continue;
			}

			if (isToolUIPart(part)) {
				const toolName = normalizeToolName(getToolName(part));

				// Group consecutive read-only tools into ExploringGroup
				if (READ_ONLY_TOOLS.has(toolName)) {
					// Read-file calls should render content inline instead of being grouped away.
					if (toolName === "mastra_workspace_read_file") {
						nodes.push(
							<ReadOnlyToolCall
								key={part.toolCallId}
								part={part as ToolPart}
								workspaceId={workspaceId}
								workspaceCwd={workspaceCwd}
								onOpenFileInPane={openFileInPane}
							/>,
						);
						i++;
						continue;
					}

					const groupStart = i;
					const groupParts: ToolPart[] = [];
					while (
						i < parts.length &&
						isToolUIPart(parts[i]) &&
						READ_ONLY_TOOLS.has(
							normalizeToolName(getToolName(parts[i] as ToolPart)),
						) &&
						normalizeToolName(getToolName(parts[i] as ToolPart)) !==
							"mastra_workspace_read_file"
					) {
						groupParts.push(parts[i] as ToolPart);
						i++;
					}

					// Single read-only tool: render inline without group wrapper
					if (groupParts.length === 1) {
						nodes.push(
							<ReadOnlyToolCall
								key={groupParts[0].toolCallId}
								part={groupParts[0]}
								workspaceId={workspaceId}
								workspaceCwd={workspaceCwd}
								onOpenFileInPane={openFileInPane}
							/>,
						);
						continue;
					}

					// Multiple consecutive read-only tools: group them
					const anyPending = groupParts.some(
						(p) => p.state !== "output-available" && p.state !== "output-error",
					);
					const exploringItems = groupParts.map((p) => {
						const args = getArgs(p);
						const name = normalizeToolName(getToolName(p));
						const filePath = getWorkspaceToolFilePath({
							toolName: name,
							args,
						});
						let title = t("chat.tool.read");
						let subtitle = "";
						let icon = FileIcon;
						switch (name) {
							case "mastra_workspace_read_file":
								title =
									p.state !== "output-available" && p.state !== "output-error"
										? t("chat.tool.reading")
										: t("chat.tool.read");
								subtitle = String(
									args.path ??
										args.filePath ??
										args.file_path ??
										args.file ??
										"",
								);
								icon = FileIcon;
								break;
							case "mastra_workspace_list_files":
								title =
									p.state !== "output-available" && p.state !== "output-error"
										? t("chat.tool.listing")
										: t("chat.tool.listed");
								subtitle = String(
									args.path ??
										args.directory ??
										args.directoryPath ??
										args.directory_path ??
										args.root ??
										args.cwd ??
										"",
								);
								icon = FolderTreeIcon;
								break;
							case "mastra_workspace_file_stat":
								title =
									p.state !== "output-available" && p.state !== "output-error"
										? t("chat.tool.checking")
										: t("chat.tool.checked");
								subtitle = String(
									args.path ?? args.file_path ?? args.file ?? "",
								);
								icon = FileSearchIcon;
								break;
							case "mastra_workspace_search":
								title =
									p.state !== "output-available" && p.state !== "output-error"
										? t("chat.tool.searching")
										: t("chat.tool.searched");
								subtitle = String(
									args.query ??
										args.pattern ??
										args.regex ??
										args.substring_pattern ??
										args.text ??
										"",
								);
								icon = SearchIcon;
								break;
							case "mastra_workspace_index":
								title =
									p.state !== "output-available" && p.state !== "output-error"
										? t("chat.tool.indexing")
										: t("chat.tool.indexed");
								icon = SearchIcon;
								break;
							default:
								title = name.replace("mastra_workspace_", "");
								icon = FileIcon;
								break;
						}
						// Show just filename for long paths
						if (subtitle.includes("/")) {
							subtitle = subtitle.split("/").pop() ?? subtitle;
						}
						return {
							icon,
							title,
							subtitle,
							isPending:
								p.state !== "output-available" && p.state !== "output-error",
							isError: p.state === "output-error",
							onClick: filePath ? () => openFileInPane(filePath) : undefined,
						};
					});

					nodes.push(
						<ExploringGroup
							key={`explore-${groupStart}`}
							items={exploringItems}
							isStreaming={anyPending && isLastAssistant && isStreaming}
						/>,
					);
					continue;
				}

				// Non-read-only tool: render as BashTool/FileDiffTool/WebSearch/etc.
				nodes.push(
					<ToolCallBlock
						key={part.toolCallId}
						part={part as ToolPart}
						isInterrupted={isInterrupted}
						workspaceId={workspaceId}
						workspaceCwd={workspaceCwd}
						onAnswer={onAnswer}
					/>,
				);
				i++;
				continue;
			}

			// Unknown part type (source, file, step-start, etc.) — skip
			i++;
		}

		return nodes;
	};

	return renderParts({ parts, isLastAssistant });
}
