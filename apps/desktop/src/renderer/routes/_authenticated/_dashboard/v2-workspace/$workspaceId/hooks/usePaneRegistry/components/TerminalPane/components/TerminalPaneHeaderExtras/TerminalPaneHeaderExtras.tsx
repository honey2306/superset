import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { SquarePen } from "lucide-react";
import { useBinding, useHotkeyDisplay } from "renderer/hotkeys";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	terminalRichInputOpenStore,
	useTerminalRichInputOpen,
} from "../../richInputOpenStore";
import { TerminalConnectionIndicator } from "./components/TerminalConnectionIndicator";

interface TerminalPaneHeaderExtrasProps {
	terminalId: string;
	terminalInstanceId: string;
}

/**
 * Header affordance that opens the rich-input overlay, so the ⌘I composer is
 * discoverable without knowing the shortcut. Toggles the same shared open-state
 * the hotkey drives; the tooltip carries the shortcut as the teach path.
 * Also hosts the connection status indicator for the pane's WebSocket.
 */
export function TerminalPaneHeaderExtras({
	terminalId,
	terminalInstanceId,
}: TerminalPaneHeaderExtrasProps) {
	const { t } = useTranslation();
	const isOpen = useTerminalRichInputOpen();
	const binding = useBinding("TOGGLE_TERMINAL_RICH_INPUT");
	const hotkeyText = useHotkeyDisplay("TOGGLE_TERMINAL_RICH_INPUT").text;
	const label = binding
		? t("v2Workspace.terminalPane.richInputWithHotkey", { hotkey: hotkeyText })
		: t("v2Workspace.terminalPane.richInput");

	return (
		<div className="flex items-center">
			<TerminalConnectionIndicator
				terminalId={terminalId}
				terminalInstanceId={terminalInstanceId}
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => terminalRichInputOpenStore.toggle()}
						aria-label={label}
						aria-pressed={isOpen}
						className={cn(
							"flex size-5 items-center justify-center transition-colors",
							isOpen
								? "bg-secondary text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<SquarePen className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{label}
				</TooltipContent>
			</Tooltip>
		</div>
	);
}
