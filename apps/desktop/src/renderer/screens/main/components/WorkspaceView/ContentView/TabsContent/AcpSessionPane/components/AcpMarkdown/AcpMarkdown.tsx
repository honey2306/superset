import { MessageResponse } from "@superset/ui/ai-elements/message";

interface AcpMarkdownProps {
	children: string;
}

/**
 * Uses the shared conversation renderer while preserving the ACP pane's
 * typography and color treatment from acp-pane.css.
 */
export function AcpMarkdown({ children }: AcpMarkdownProps) {
	return (
		<MessageResponse animated={false} isAnimating={false} className="acp-md">
			{children}
		</MessageResponse>
	);
}
