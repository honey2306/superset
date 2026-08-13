import type { ContentBlock } from "@superset/session-protocol";
import { MessageResponse } from "@superset/ui/ai-elements/message";
import { useState } from "react";
import { AcpMarkdown } from "../../../AcpMarkdown";
import { AcpUnknownContent } from "../AcpUnknownContent";

interface AcpContentBlockProps {
	block: ContentBlock;
}

export function AcpContentBlock({ block }: AcpContentBlockProps) {
	const [expanded, setExpanded] = useState(false);

	if (block.type === "text") {
		return <AcpMarkdown>{block.text}</AcpMarkdown>;
	}

	if (block.type === "image") {
		// ACP requires image blocks to carry the displayable image payload in
		// `data`. `uri` is only an optional reference and can point into the
		// agent's private filesystem, which is not reachable by the renderer.
		const src = block.data.startsWith("data:")
			? block.data
			: `data:${block.mimeType};base64,${block.data}`;
		if (!src) return <AcpUnknownContent content={block} />;
		return (
			<img
				src={src}
				alt=""
				style={{
					maxHeight: 256,
					maxWidth: "100%",
					borderRadius: 4,
					border: "1px solid var(--acp-line)",
					objectFit: "contain",
				}}
			/>
		);
	}

	if (block.type === "audio") {
		return (
			<div className="acp-unknown">
				<span>Audio</span>
				<span> — playback not yet supported</span>
			</div>
		);
	}

	if (block.type === "resource_link") {
		const b = block as unknown as { uri?: string; name?: string };
		return (
			<div
				className="acp-term-ref"
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "flex-start",
				}}
			>
				<span>Resource</span>
				<b
					className="select-text cursor-text"
					style={{ wordBreak: "break-all" }}
				>
					{b.name ?? b.uri ?? "(no uri)"}
				</b>
			</div>
		);
	}

	if (block.type === "resource") {
		const b = block as unknown as {
			resource?: { text?: string; uri?: string; mimeType?: string };
		};
		const resource = b.resource;
		const text = resource && "text" in resource ? resource.text : null;
		return (
			<div className="acp-tool">
				<button
					type="button"
					className="acp-tool__head"
					data-expanded={expanded ? "true" : undefined}
					onClick={() => setExpanded((v) => !v)}
				>
					<span className="acp-tool__caret" aria-hidden>
						{expanded ? "▾" : "›"}
					</span>
					<span className="acp-tool__title">Resource</span>
				</button>
				{expanded && (
					<div className="acp-tool__body">
						{text ? (
							<MessageResponse
								animated={false}
								isAnimating={false}
								className="text-xs"
							>
								{text}
							</MessageResponse>
						) : (
							<pre
								className="select-text cursor-text"
								style={{
									margin: 0,
									maxHeight: 200,
									overflow: "auto",
									whiteSpace: "pre-wrap",
									wordBreak: "break-all",
									fontFamily: "var(--acp-font-mono)",
									color: "var(--acp-muted)",
									fontSize: 11,
								}}
							>
								{JSON.stringify(b.resource, null, 2)?.slice(0, 2000)}
							</pre>
						)}
					</div>
				)}
			</div>
		);
	}

	return <AcpUnknownContent content={block} />;
}
