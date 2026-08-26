import type { MessageItem } from "@superset/session-protocol";
import { MessageMarkdown } from "./MessageMarkdown";

interface Props {
	item: MessageItem;
}

export function MessageBubble({ item }: Props) {
	const isUser = item.role === "user";
	const isThought = item.role === "thought";
	const text = item.blocks
		.map((b) => (b.type === "text" ? b.text : `[${b.type}]`))
		.join("");
	return (
		<div className={isUser ? "flex justify-end" : ""}>
			<div
				className={
					isUser
						? "mobile-user-message max-w-[85%] rounded-2xl px-3 py-2 text-sm"
						: isThought
							? "mobile-thought-message max-w-full whitespace-pre-wrap rounded-2xl px-3 py-2 text-xs"
							: "mobile-assistant-message max-w-full rounded-2xl text-sm text-[var(--phone-text)]"
				}
			>
				{isUser || isThought ? (
					text || (isUser ? "" : "…")
				) : text ? (
					<MessageMarkdown>{text}</MessageMarkdown>
				) : (
					"…"
				)}
				{item.failed ? (
					<span className="ml-2 text-xs text-red-400">(failed)</span>
				) : null}
			</div>
		</div>
	);
}
