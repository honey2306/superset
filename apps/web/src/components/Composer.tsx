import { useRef, useState } from "react";

interface Props {
	disabled?: boolean;
	busy?: boolean;
	onSubmit: (text: string) => void | Promise<void>;
	onCancel?: () => void;
}

export function Composer({ disabled, busy, onSubmit, onCancel }: Props) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	function handleSubmit(): void {
		if (busy || disabled) return;
		if (!value.trim()) return;
		const text = value;
		setValue("");
		void onSubmit(text);
	}

	return (
		<div className="mt-2 flex items-end gap-2 rounded-2xl bg-white/5 p-2 ring-1 ring-white/10">
			<textarea
				ref={textareaRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
						e.preventDefault();
						handleSubmit();
					}
				}}
				disabled={disabled}
				placeholder={disabled ? "Reconnecting…" : "Send a message"}
				inputMode="text"
				enterKeyHint="send"
				autoCapitalize="sentences"
				autoCorrect="on"
				rows={1}
				className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-white/40 disabled:opacity-50"
			/>
			{busy && onCancel ? (
				<button
					type="button"
					onClick={onCancel}
					className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200 ring-1 ring-red-500/30"
				>
					Stop
				</button>
			) : (
				<button
					type="button"
					disabled={disabled || busy || !value.trim()}
					onClick={handleSubmit}
					className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-black disabled:opacity-40"
				>
					Send
				</button>
			)}
		</div>
	);
}
