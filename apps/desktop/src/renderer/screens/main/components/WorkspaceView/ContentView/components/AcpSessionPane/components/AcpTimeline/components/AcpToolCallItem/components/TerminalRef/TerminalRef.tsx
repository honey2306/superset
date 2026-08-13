import type { TerminalStream } from "@superset/session-protocol";
import { useId, useState } from "react";
import { getAgentCommandDetails } from "./agentCommandDetails";

interface TerminalRefProps {
	terminalId: string;
	title?: string | null;
	rawInput?: unknown;
	rawOutput?: unknown;
	status?: string | null;
	terminal?: TerminalStream;
}

export function TerminalRef({
	terminalId,
	title,
	rawInput,
	rawOutput,
	status,
	terminal,
}: TerminalRefProps) {
	const [expanded, setExpanded] = useState(false);
	const detailsId = useId();
	const details = getAgentCommandDetails({
		title,
		rawInput,
		rawOutput,
		status,
		terminal,
	});
	const summary = details.command ?? details.summary ?? "Agent command";

	return (
		<div className="acp-agent-command">
			<button
				type="button"
				className="acp-agent-command__head"
				aria-controls={detailsId}
				aria-expanded={expanded}
				aria-label={
					expanded ? "Hide agent command details" : "Show agent command details"
				}
				onClick={() => setExpanded((value) => !value)}
			>
				<span className="acp-agent-command__caret" aria-hidden>
					{expanded ? "▾" : "›"}
				</span>
				<span className="acp-agent-command__label">Agent command</span>
				<span className="acp-agent-command__summary select-text cursor-text">
					{summary}
				</span>
				{details.status && (
					<span className="acp-agent-command__status">{details.status}</span>
				)}
			</button>
			{expanded && (
				<div className="acp-agent-command__body" id={detailsId}>
					{details.command && (
						<div className="acp-agent-command__section">
							<span>Command</span>
							<pre className="select-text cursor-text">{details.command}</pre>
						</div>
					)}
					{details.output && (
						<div className="acp-agent-command__section">
							<span>Output</span>
							<pre className="select-text cursor-text">{details.output}</pre>
						</div>
					)}
					{details.cwd && (
						<div className="acp-agent-command__reference">
							<span>Working directory</span>
							<code className="select-text cursor-text">{details.cwd}</code>
						</div>
					)}
					{details.exitCode !== undefined && (
						<div className="acp-agent-command__reference">
							<span>Exit code</span>
							<code className="select-text cursor-text">
								{details.exitCode}
							</code>
						</div>
					)}
					{details.signal !== undefined && (
						<div className="acp-agent-command__reference">
							<span>Signal</span>
							<code className="select-text cursor-text">
								{details.signal ?? "none"}
							</code>
						</div>
					)}
					<div className="acp-agent-command__reference">
						<span>Agent reference</span>
						<code className="select-text cursor-text">{terminalId}</code>
					</div>
				</div>
			)}
		</div>
	);
}
