import { useState } from "react";

interface MobileTerminalInputProps {
	onSend: (data: string) => void;
}

const keys: Array<[string, string]> = [
	["Tab", "\t"],
	["Esc", "\u001b"],
	["↑", "\u001b[A"],
	["↓", "\u001b[B"],
	["←", "\u001b[D"],
	["→", "\u001b[C"],
	["Ctrl-C", "\u0003"],
];

export function MobileTerminalInput({ onSend }: MobileTerminalInputProps) {
	const [value, setValue] = useState("");
	const send = () => {
		if (!value) return;
		onSend(value);
		setValue("");
	};
	return (
		<div className="flex flex-col gap-2 border-t border-white/10 pt-2">
			<div className="flex gap-1 overflow-x-auto">
				{keys.map(([label, data]) => (
					<button
						key={label}
						type="button"
						onClick={() => onSend(data)}
						className="rounded bg-white/10 px-2 py-1 text-xs text-white/80"
					>
						{label}
					</button>
				))}
			</div>
			<div className="flex gap-2">
				<textarea
					value={value}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							send();
							onSend("\r");
						}
						if (event.key === "Backspace" && !value) onSend("\u007f");
					}}
					placeholder="Type a command"
					rows={1}
					className="min-w-0 flex-1 rounded bg-white/10 px-2 py-2 text-sm text-white"
				/>
				<button
					type="button"
					onClick={send}
					className="rounded bg-white px-3 text-sm text-black"
				>
					Send
				</button>
			</div>
		</div>
	);
}
