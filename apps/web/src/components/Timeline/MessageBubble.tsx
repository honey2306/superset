import type { MessageItem } from "@superset/session-protocol";

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
						? "max-w-[85%] rounded-2xl bg-white px-3 py-2 text-sm text-black"
						: isThought
							? "max-w-full whitespace-pre-wrap rounded-2xl bg-white/5 px-3 py-2 text-xs text-white/60 ring-1 ring-white/10"
							: "max-w-full whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm text-white/90"
				}
			>
				{text || (isUser ? "" : "…")}
				{item.failed ? (
					<span className="ml-2 text-xs text-red-400">(failed)</span>
				) : null}
			</div>
		</div>
	);
}
