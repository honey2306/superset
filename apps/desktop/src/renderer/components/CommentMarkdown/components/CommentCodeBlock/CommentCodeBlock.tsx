import { mermaid } from "@streamdown/mermaid";
import type { ReactNode } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
	oneDark,
	oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { getMermaidThemeVariables } from "renderer/lib/mermaid";
import { useTheme } from "renderer/stores";
import { Streamdown } from "streamdown";

const mermaidPlugins = { mermaid };

interface CommentCodeBlockProps {
	className?: string;
	children?: ReactNode;
}

/**
 * Lightweight code renderer for PR comments. Skips ShowCode's
 * line-number/copy chrome — too heavy for short inline review snippets.
 */
export function CommentCodeBlock({
	className,
	children,
}: CommentCodeBlockProps) {
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
