import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import {
	LuPanelRight,
	LuPanelRightClose,
	LuPanelRightOpen,
} from "react-icons/lu";
import { HotkeyLabel } from "renderer/hotkeys";
import { useSidebarStore } from "renderer/stores";

export function RightSidebarToggle() {
	const isOpen = useSidebarStore((state) => state.isSidebarOpen);
	const toggleSidebar = useSidebarStore((state) => state.toggleSidebar);

	const getToggleIcon = (isHovering: boolean) => {
		if (!isOpen) {
			return isHovering ? (
				<LuPanelRightOpen className="size-4" strokeWidth={1.5} />
			) : (
				<LuPanelRight className="size-4" strokeWidth={1.5} />
			);
		}
		return isHovering ? (
			<LuPanelRightClose className="size-4" strokeWidth={1.5} />
		) : (
			<LuPanelRight className="size-4" strokeWidth={1.5} />
		);
	};

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={toggleSidebar}
					aria-label="Toggle right sidebar"
					className="no-drag group flex size-8 items-center justify-center rounded-ds-3 text-fg-mute transition-colors hover:bg-hover hover:text-fg"
				>
					<span className="group-hover:hidden">{getToggleIcon(false)}</span>
					<span className="hidden group-hover:block">
						{getToggleIcon(true)}
					</span>
				</button>
			</TooltipTrigger>
			<TooltipContent side="left">
				<HotkeyLabel label="Toggle right sidebar" id="TOGGLE_SIDEBAR" />
			</TooltipContent>
		</Tooltip>
	);
}
