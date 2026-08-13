import type { QueuedPrompt } from "@superset/session-protocol";

interface Props {
	prompts: QueuedPrompt[];
	onRemove: (queueId: string) => void;
}

function promptLabel(prompt: QueuedPrompt): string {
	return (
		prompt.prompt
			.map((block) => (block.type === "text" ? block.text : `[${block.type}]`))
			.join("") || "Queued prompt"
	);
}

export function PromptQueue({ prompts, onRemove }: Props) {
	if (prompts.length === 0) return null;
	return (
		<section
			className="mobile-timeline-card mb-2 rounded-xl p-2"
			aria-label="Queued prompts"
		>
			<div className="mobile-caption-text mb-1 px-1 text-xs">
				Queue · {prompts.length}
			</div>
			<ul className="flex flex-col gap-1">
				{prompts.map((prompt) => (
					<li
						key={prompt.queueId}
						className="flex min-w-0 items-center gap-2 px-1 py-1"
					>
						<span className="min-w-0 flex-1 truncate text-sm">
							{promptLabel(prompt)}
						</span>
						<button
							type="button"
							onClick={() => onRemove(prompt.queueId)}
							className="text-xs text-white/55"
						>
							Remove
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}
