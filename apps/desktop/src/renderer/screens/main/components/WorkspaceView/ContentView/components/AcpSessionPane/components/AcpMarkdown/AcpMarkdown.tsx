import { MessageResponseV2 } from "@superset/ui/ai-elements/message-v2";

interface AcpMarkdownProps {
	children: string;
}

/**
 * Uses the shared conversation renderer while preserving the ACP pane's
 * typography and color treatment from acp-pane.css.
 *
 * `select-text cursor-text` is required because the desktop shell sets a
 * global `user-select: none` on <body>; without opting back in, agent
 * markdown output cannot be selected or copied.
 */
export function AcpMarkdown({ children }: AcpMarkdownProps) {
	return (
		<MessageResponseV2
			animated={false}
			isAnimating={false}
			className="acp-md select-text cursor-text"
		>
			{children}
		</MessageResponseV2>
	);
}
