import { FaSlack } from "react-icons/fa";
import { HiCheck } from "react-icons/hi2";

const MESSAGES = [
	{
		id: "1",
		author: "Maya",
		text: "Can someone turn the login bug into a task?",
	},
	{
		id: "2",
		author: "Superset",
		text: "Created LIN-248 and linked the thread.",
	},
];

export function SlackIntegrationDemo() {
	return (
		<div className="flex h-full w-full items-center justify-center">
			<div className="w-[300px] overflow-hidden rounded-ds-5 border border-line bg-surface/90 shadow-2xl backdrop-blur-sm">
				<div className="flex items-center justify-between border-line/50 border-b bg-hover/80 px-4 py-3">
					<div className="flex items-center gap-2">
						<FaSlack className="size-4 text-violet-400" />
						<span className="font-medium text-fg text-xs">#engineering</span>
					</div>
					<span className="rounded bg-fg/10 px-2 py-0.5 text-fg-mute text-xs">
						Live
					</span>
				</div>

				<div className="space-y-3 p-4">
					{MESSAGES.map((message) => (
						<div key={message.id} className="flex gap-3">
							<div className="flex size-7 shrink-0 items-center justify-center rounded bg-fg/10 font-semibold text-[10px] text-fg/90">
								{message.author === "Superset" ? "S" : "M"}
							</div>
							<div className="min-w-0 flex-1">
								<div className="font-medium text-fg text-xs">
									{message.author}
								</div>
								<div className="text-fg-mute text-xs leading-relaxed">
									{message.text}
								</div>
							</div>
						</div>
					))}

					<div className="rounded-ds-3 border border-emerald-500/20 bg-success/10 px-3 py-2">
						<div className="flex items-center gap-2 text-success text-xs">
							<HiCheck className="size-3.5" />
							<span className="font-medium">Task synced to Linear</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
