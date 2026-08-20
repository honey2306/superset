import { MessageResponseV2 } from "@superset/ui/ai-elements/message-v2";
import { type MouseEvent, type ReactNode, useMemo } from "react";
import type { Components } from "react-markdown";
import {
	getMarkdownFileTarget,
	type MarkdownFileTarget,
	remarkAcpLinks,
} from "./linkifyAcpMarkdown";

interface AcpMarkdownProps {
	children: string;
	onOpenFile?(target: MarkdownFileTarget, openExternally: boolean): void;
	onOpenUrl?(url: string): void;
}

const ACP_REMARK_PLUGINS = [remarkAcpLinks];

/**
 * Uses the shared conversation renderer while preserving the ACP pane's
 * typography and color treatment from acp-pane.css.
 *
 * `select-text cursor-text` is required because the desktop shell sets a
 * global `user-select: none` on <body>; without opting back in, agent
 * markdown output cannot be selected or copied.
 */
export function AcpMarkdown({
	children,
	onOpenFile,
	onOpenUrl,
}: AcpMarkdownProps) {
	const components = useMemo<Components>(
		() => ({
			a: ({ href, children: linkChildren }) => {
				const fileTarget = getMarkdownFileTarget(href);
				const isWebUrl = /^https?:\/\//iu.test(href ?? "");
				const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
					if (fileTarget && onOpenFile) {
						event.preventDefault();
						onOpenFile(fileTarget, event.metaKey || event.ctrlKey);
						return;
					}
					if (isWebUrl && onOpenUrl) {
						event.preventDefault();
						onOpenUrl(href ?? "");
					}
				};
				return (
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						onClick={handleClick}
					>
						{linkChildren as ReactNode}
					</a>
				);
			},
		}),
		[onOpenFile, onOpenUrl],
	);
	return (
		<MessageResponseV2
			animated={false}
			isAnimating={false}
			className="acp-md select-text cursor-text"
			remarkPlugins={ACP_REMARK_PLUGINS}
			components={components}
		>
			{children}
		</MessageResponseV2>
	);
}
