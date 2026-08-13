import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useState } from "react";
import { HiArrowDown } from "react-icons/hi2";
import { useBinding, useHotkeyDisplay } from "renderer/hotkeys";
import { useTranslation } from "renderer/providers/I18nProvider";
import { scrollToBottom } from "../utils";

interface ScrollToBottomButtonProps {
	terminal: Terminal | null;
}

export function ScrollToBottomButton({ terminal }: ScrollToBottomButtonProps) {
	const { t } = useTranslation();
	const [isVisible, setIsVisible] = useState(false);
	const binding = useBinding("SCROLL_TO_BOTTOM");
	const shortcutText = useHotkeyDisplay("SCROLL_TO_BOTTOM").text;
	const showShortcut = binding !== null;

	const checkScrollPosition = useCallback(() => {
		if (!terminal) return;
		const buffer = terminal.buffer.active;
		const isAtBottom = buffer.viewportY >= buffer.baseY;
		setIsVisible(!isAtBottom);
	}, [terminal]);

	useEffect(() => {
		if (!terminal) return;

		checkScrollPosition();

		const writeDisposable = terminal.onWriteParsed(checkScrollPosition);
		const scrollDisposable = terminal.onScroll(checkScrollPosition);

		return () => {
			writeDisposable.dispose();
			scrollDisposable.dispose();
		};
	}, [terminal, checkScrollPosition]);

	const handleClick = () => {
		if (terminal) {
			scrollToBottom(terminal);
		}
	};

	return (
		<div
			className={cn(
				"absolute bottom-4 left-1/2 z-10 -translate-x-1/2 transition-all duration-200",
				isVisible
					? "translate-y-0 opacity-100"
					: "pointer-events-none translate-y-2 opacity-0",
			)}
		>
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={handleClick}
						className="flex size-8 items-center justify-center rounded-full border border-line bg-background text-fg-mute transition-colors hover:bg-hover hover:text-fg"
					>
						<HiArrowDown className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="left">
					{t("workspace.paneRegistry.scrollToBottom")}
					{showShortcut && ` (${shortcutText})`}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
