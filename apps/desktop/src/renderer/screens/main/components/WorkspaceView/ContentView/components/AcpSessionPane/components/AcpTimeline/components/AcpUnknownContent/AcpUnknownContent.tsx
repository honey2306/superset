interface AcpUnknownContentProps {
	content: unknown;
}

export function AcpUnknownContent({ content }: AcpUnknownContentProps) {
	const type = (content as Record<string, unknown>)?.type;
	return (
		<div className="acp-unknown">
			<span>[unknown: {String(type ?? "?")}]</span>
			<pre className="select-text cursor-text">
				{JSON.stringify(content, null, 2).slice(0, 500)}
			</pre>
		</div>
	);
}
