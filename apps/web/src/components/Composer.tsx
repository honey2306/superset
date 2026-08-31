import { useLayoutEffect, useRef, useState } from "react";
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

	useLayoutEffect(() => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		textarea.style.height = value.length === 0 ? "44px" : "0px";
		const nextHeight = Math.min(textarea.scrollHeight, 160);
		textarea.style.height = `${nextHeight}px`;
		textarea.style.overflowY =
			textarea.scrollHeight > nextHeight ? "auto" : "hidden";
	}, [value]);

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

	const submitLabel = queueing ? "Queue message" : "Send message";

	return (
		<div className="mobile-composer mt-2">
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
				placeholder={disabled ? "Reconnecting…" : "Message"}
				aria-label="Send a message"
				inputMode="text"
				enterKeyHint="send"
				autoCapitalize="sentences"
				autoCorrect="on"
				rows={1}
				className="mobile-composer-input"
			/>
			<div className="mobile-composer-actions">
				{busy && onCancel ? (
					<button
						type="button"
						onClick={onCancel}
						className="mobile-composer-stop"
						aria-label="Stop response"
						title="Stop response"
					>
						<span aria-hidden="true" />
					</button>
				) : null}
				<button
					type="button"
					disabled={disabled || (busy && !queueing) || !value.trim()}
					onClick={handleSubmit}
					className="mobile-composer-submit"
					aria-label={submitLabel}
					title={submitLabel}
					data-queueing={queueing ? "true" : undefined}
				>
					<svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
						<path d="M10 15V5m0 0L6.5 8.5M10 5l3.5 3.5" />
					</svg>
					{queueing ? (
						<span className="mobile-composer-queue-mark" aria-hidden="true">
							+
						</span>
					) : null}
				</button>
			</div>
		</div>
	);
}
