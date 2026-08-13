import type { ContentBlock } from "@superset/session-protocol";
import { AcpContentBlock } from "../../../AcpContentBlock";

interface ContentViewProps {
	content: unknown;
}

export function ContentView({ content }: ContentViewProps) {
	if (content && typeof content === "object" && "type" in content) {
		return <AcpContentBlock block={content as ContentBlock} />;
	}
	return (
		<pre
			className="select-text cursor-text"
			style={{
				margin: 0,
				overflow: "auto",
				whiteSpace: "pre-wrap",
				wordBreak: "break-all",
				fontSize: 11,
				fontFamily: "var(--acp-font-mono)",
				color: "var(--acp-muted)",
				opacity: 0.75,
			}}
		>
			{JSON.stringify(content, null, 2)?.slice(0, 1000)}
		</pre>
	);
}
