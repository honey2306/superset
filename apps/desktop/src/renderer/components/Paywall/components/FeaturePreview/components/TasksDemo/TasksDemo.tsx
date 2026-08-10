import { HiCheck } from "react-icons/hi2";

const TASKS = [
	{
		id: "1",
		title: "Implement user authentication",
		status: "done",
		assignee: "SC",
	},
	{
		id: "2",
		title: "Add workspace sync API",
		status: "in-progress",
		assignee: "AR",
	},
	{
		id: "3",
		title: "Fix mobile responsive layout",
		status: "in-progress",
		assignee: "JL",
	},
	{
		id: "4",
		title: "Update API documentation",
		status: "todo",
		assignee: "TK",
	},
	{
		id: "5",
		title: "Write unit tests for auth",
		status: "todo",
		assignee: "SC",
	},
];

function SpinnerIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="3"
			/>
			<path
				className="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			/>
		</svg>
	);
}

export function TasksDemo() {
	return (
		<div className="w-full h-full flex items-center justify-center">
			<div className="w-[300px] bg-surface/90 backdrop-blur-sm rounded-ds-5 border border-line shadow-2xl overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 bg-hover/80 border-b border-line/50">
					<div className="flex items-center gap-2">
						<div className="flex gap-1.5">
							<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
						</div>
						<span className="text-xs text-fg-mute ml-1">My Tasks</span>
					</div>
					<span className="text-xs text-fg-mute bg-fg/10 px-2 py-0.5 rounded">
						{TASKS.length} tasks
					</span>
				</div>

				{/* Task list */}
				<div className="p-2">
					{TASKS.map((task) => (
						<div
							key={task.id}
							className="flex items-center gap-3 px-3 py-2.5 rounded-ds-5 hover:bg-fg/5 transition-colors cursor-pointer group"
						>
							{/* Status indicator */}
							{task.status === "done" ? (
								<div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center shrink-0">
									<HiCheck className="w-3 h-3 text-success" />
								</div>
							) : task.status === "in-progress" ? (
								<SpinnerIcon className="w-5 h-5 text-warning animate-spin shrink-0" />
							) : (
								<div className="w-5 h-5 rounded-full border-2 border-fg/20 shrink-0 group-hover:border-fg/40 transition-colors" />
							)}

							{/* Task content */}
							<div className="flex-1 min-w-0">
								<span
									className={`text-xs block truncate ${
										task.status === "done"
											? "text-fg-mute line-through"
											: "text-fg"
									}`}
								>
									{task.title}
								</span>
							</div>

							{/* Assignee */}
							<div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium text-fg/90 shrink-0 bg-fg/10">
								{task.assignee}
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
