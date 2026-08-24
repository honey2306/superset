import { useRef, useState } from "react";
import { draftToRestore } from "./composerDraft";

interface Props {
	disabled?: boolean;
	busy?: boolean;
	queueing?: boolean;
	onSubmit: (text: string) => void | Promise<void>;
	onCancel?: () => void;
}

export function Composer({
	disabled,
	busy,
	queueing,
	onSubmit,
	onCancel,
}: Props) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const draftVersionRef = useRef(0);

	function handleSubmit(): void {
		if (disabled || (busy && !queueing)) return;
		if (!value.trim()) return;
		const text = value;
		const submissionVersion = draftVersionRef.current;
		setValue("");
		const restoreOnFailure = () => {
			const draft = draftToRestore({
				currentVersion: draftVersionRef.current,
				submissionVersion,
				submittedText: text,
			});
			if (draft !== null) setValue(draft);
		};
		try {
			void Promise.resolve(onSubmit(text)).catch(restoreOnFailure);
		} catch {
			restoreOnFailure();
		}
	}

	return (
		<div className="mobile-composer mt-2 flex items-end gap-2 rounded-2xl p-2">
			<textarea
				ref={textareaRef}
				value={value}
				onChange={(e) => {
					draftVersionRef.current += 1;
					setValue(e.target.value);
				}}
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
				className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-base text-[var(--phone-text)] outline-none placeholder:text-[var(--phone-caption)] disabled:opacity-50"
			/>
			{busy && onCancel ? (
				<>
					<button
						type="button"
						disabled={disabled || (busy && !queueing) || !value.trim()}
						onClick={handleSubmit}
						className="mobile-primary-button px-3 py-2 text-sm font-medium disabled:opacity-40"
					>
						{queueing ? "Queue" : "Send"}
					</button>
					<button
						type="button"
						onClick={onCancel}
						className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200 ring-1 ring-red-500/30"
					>
						Stop
					</button>
				</>
			) : (
				<button
					type="button"
					disabled={disabled || (busy && !queueing) || !value.trim()}
					onClick={handleSubmit}
					className="mobile-primary-button px-3 py-2 text-sm font-medium disabled:opacity-40"
				>
					{queueing ? "Queue" : "Send"}
				</button>
			)}
		</div>
	);
}
