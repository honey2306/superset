import { mermaid } from "@streamdown/mermaid";
import { Avatar, AvatarFallback, AvatarImage } from "@superset/ui/avatar";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { FaGithub } from "react-icons/fa";
import { LuArrowUpRight, LuCheck, LuCopy } from "react-icons/lu";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	oneDark,
	oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { getMermaidThemeVariables } from "renderer/lib/mermaid";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { useTheme } from "renderer/stores/theme";
import type { CommentPaneState } from "shared/tabs-types";
import { Streamdown } from "streamdown";
import "./comment-pane.css";

/**
 * Panes-engine renderer for the v1 `comment` pane kind.
 *
 * Wraps the v1 `CommentPane` body (the PR-review comment viewer) without
 * the mosaic `BasePaneWindow` shell: the panes `<Workspace>` renders the
 * header (title / actions / split+close menu). The comment payload comes
 * from the panes pane `data.comment` (`CommentPaneState`), so the
 * renderer is pure with respect to the panes store and does not depend
 * on the v1 global tabs store. This mirrors the terminal bridge: the
 * panes `data` owns the pane identity + payload, and the opener (M3)
 * seeds `data.comment` when routing the notification-controller open
 * through the panes store.
 */
export function PanesCommentContent({
	comment,
}: {
	comment: CommentPaneState;
}) {
	const [copied, setCopied] = useState(false);
	const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isMountedRef = useRef(true);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
		};
	}, []);

	const handleCopyAll = useCallback(() => {
		if (!comment) return;
		void electronTrpcClient.external.copyText
			.mutate(comment.body)
			.then(() => {
				if (!isMountedRef.current) return;
				if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
				setCopied(true);
				copyTimerRef.current = setTimeout(() => {
					if (!isMountedRef.current) return;
					setCopied(false);
					copyTimerRef.current = null;
				}, 1500);
			})
			.catch((err) => {
				console.warn("Failed to copy comment text", err);
			});
	}, [comment]);

	return (
		<div className="flex h-full w-full flex-col overflow-hidden">
			<div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
				<Avatar className="size-5 shrink-0">
					{comment.avatarUrl ? (
						<AvatarImage src={comment.avatarUrl} alt={comment.authorLogin} />
					) : null}
					<AvatarFallback className="text-[10px] font-medium">
						{comment.authorLogin.slice(0, 2).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<span className="text-sm font-medium text-fg">
					{comment.authorLogin}
				</span>
				{comment.path && (
					<span className="truncate text-xs text-fg-mute">
						{comment.path}
						{comment.line != null ? `:${comment.line}` : ""}
					</span>
				)}
				{comment.url && (
					<a
						href={comment.url}
						target="_blank"
						rel="noopener noreferrer"
						className="ml-auto flex shrink-0 items-center gap-0.5 text-fg-mute hover:text-fg"
						aria-label="View on GitHub"
					>
						<FaGithub className="size-3.5" />
						<LuArrowUpRight className="size-3" />
					</a>
				)}
				<button
					type="button"
					onClick={handleCopyAll}
					className="flex shrink-0 items-center gap-1 text-xs text-fg-mute hover:text-fg"
				>
					{copied ? (
						<>
							<LuCheck className="size-3" />
							Copied
						</>
					) : (
						<>
							<LuCopy className="size-3" />
							Copy All
						</>
					)}
				</button>
			</div>
			<div className="comment-pane-markdown min-h-0 flex-1 overflow-y-auto select-text">
				<article className="w-full px-6 py-5">
					<ReactMarkdown
						remarkPlugins={[remarkGfm]}
						rehypePlugins={[rehypeRaw, rehypeSanitize]}
						components={commentComponents}
					>
						{comment.body}
					</ReactMarkdown>
				</article>
			</div>
		</div>
	);
}

const mermaidPlugins = { mermaid };

function CommentCodeBlock({
	className,
	children,
}: {
	className?: string;
	children?: ReactNode;
}) {
	const theme = useTheme();
	const isDark = theme?.type !== "light";

	const match = /language-(\w+)/.exec(className || "");
	const language = match ? match[1] : undefined;
	const codeString = String(children).replace(/\n$/, "");

	if (language === "mermaid") {
		return (
			<Streamdown
				mode="static"
				plugins={mermaidPlugins}
				mermaid={{
					config: {
						theme: "base",
						themeVariables: getMermaidThemeVariables(theme),
					},
				}}
			>
				{`\`\`\`mermaid\n${codeString}\n\`\`\``}
			</Streamdown>
		);
	}

	if (!language) {
		return (
			<code className="rounded bg-hover px-1.5 py-0.5 font-mono text-sm">
				{children}
			</code>
		);
	}

	return (
		<SyntaxHighlighter
			style={
				(isDark ? oneDark : oneLight) as Record<string, React.CSSProperties>
			}
			language={language}
			PreTag="div"
			className="rounded-ds-3 text-sm"
		>
			{codeString}
		</SyntaxHighlighter>
	);
}

const commentComponents = {
	code: CommentCodeBlock,
	table: ({ children }: { children?: ReactNode }) => (
		<CopyableTable>{children}</CopyableTable>
	),
};

function CopyableTable({ children }: { children?: ReactNode }) {
	const tableRef = useRef<HTMLTableElement>(null);
	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isMountedRef = useRef(true);

	useEffect(() => {
		return () => {
			isMountedRef.current = false;
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	const handleCopy = useCallback(() => {
		const el = tableRef.current;
		if (!el) return;

		const rows = el.querySelectorAll("tr");
		const lines: string[] = [];
		for (const row of rows) {
			const cells = row.querySelectorAll("th, td");
			const values: string[] = [];
			for (const cell of cells) {
				values.push((cell.textContent ?? "").trim());
			}
			lines.push(values.join("\t"));
		}
		const text = lines.join("\n");
		void electronTrpcClient.external.copyText
			.mutate(text)
			.then(() => {
				if (!isMountedRef.current) return;
				if (timerRef.current) clearTimeout(timerRef.current);
				setCopied(true);
				timerRef.current = setTimeout(() => {
					if (!isMountedRef.current) return;
					setCopied(false);
					timerRef.current = null;
				}, 1500);
			})
			.catch((err) => {
				console.warn("Failed to copy table text", err);
			});
	}, []);

	return (
		<div className="relative">
			<button
				type="button"
				onClick={handleCopy}
				className="absolute right-0 -top-6 z-10 rounded-sm px-1.5 py-0.5 text-2xs text-fg-mute hover:text-fg"
			>
				{copied ? (
					<span className="flex items-center gap-1">
						<LuCheck className="size-3" />
						Copied
					</span>
				) : (
					"Copy"
				)}
			</button>
			<div className="overflow-x-auto">
				<table ref={tableRef} className="w-full table-auto">
					{children}
				</table>
			</div>
		</div>
	);
}
