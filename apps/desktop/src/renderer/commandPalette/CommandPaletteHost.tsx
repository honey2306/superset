import { type ReactNode, useEffect } from "react";
import { useHotkey } from "renderer/hotkeys";
import { CommandContextProvider } from "./core/ContextProvider";
import { useFrameStackStore } from "./core/frames";
import { registerAllModules } from "./modules";
import { checkResourcesCommand } from "./modules/resources/commands";
import { CommandPalette } from "./ui/CommandPalette/CommandPalette";
import { FolderImportMount } from "./ui/FolderImportMount/FolderImportMount";
import { SetPreferredOpenInAppMount } from "./ui/SetPreferredOpenInAppMount/SetPreferredOpenInAppMount";

export function CommandPaletteHost({ children }: { children?: ReactNode }) {
	useEffect(() => {
		const unregister = registerAllModules();
		return unregister;
	}, []);

	return (
		<CommandContextProvider>
			<CommandPaletteTrigger />
			<CommandPalette />
			<SetPreferredOpenInAppMount />
			<FolderImportMount />
			{children}
		</CommandContextProvider>
	);
}

function CommandPaletteTrigger() {
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const reset = useFrameStackStore((s) => s.reset);
	const pushFrame = useFrameStackStore((s) => s.pushFrame);
	useHotkey("OPEN_COMMAND_PALETTE", () => setOpen(true));
	useHotkey("CHECK_RESOURCES", () => {
		setOpen(true);
		reset();
		pushFrame(checkResourcesCommand);
	});
	return null;
}
