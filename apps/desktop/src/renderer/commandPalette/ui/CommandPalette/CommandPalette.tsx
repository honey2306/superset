import { Command, CommandInput } from "@superset/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { ArrowLeftIcon } from "lucide-react";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useCommandContext } from "../../core/ContextProvider";
import { executeCommand } from "../../core/execute";
import { useFrameStackStore } from "../../core/frames";
import type { Command as CommandType } from "../../core/types";
import { CommandListView } from "../CommandListView/CommandListView";
import { SubPaletteView } from "../SubPaletteView/SubPaletteView";

const QueryContext = createContext<string>("");
export function useCommandPaletteQuery(): string {
	return useContext(QueryContext);
}

export function CommandPalette() {
	const { t } = useTranslation();
	const open = useFrameStackStore((s) => s.open);
	const setOpen = useFrameStackStore((s) => s.setOpen);
	const frames = useFrameStackStore((s) => s.frames);
	const pushFrame = useFrameStackStore((s) => s.pushFrame);
	const popFrame = useFrameStackStore((s) => s.popFrame);
	const reset = useFrameStackStore((s) => s.reset);

	const context = useCommandContext();
	const [query, setQuery] = useState("");
	const depth = frames.length;
	const currentFrame = frames[depth - 1] ?? null;

	const handleOpenChange = useCallback(
		(next: boolean) => {
			setOpen(next);
			if (!next) {
				setQuery("");
				reset();
			}
		},
		[setOpen, reset],
	);

	const handleSelect = useCallback(
		(command: CommandType) => {
			if (command.children || command.renderFrame) {
				pushFrame(command);
				setQuery("");
				return;
			}
			void executeCommand(command, context);
			handleOpenChange(false);
		},
		[pushFrame, context, handleOpenChange],
	);

	const handleBack = useCallback(() => {
		popFrame();
		setQuery("");
	}, [popFrame]);

	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.key === "Backspace" && !query && depth > 0) {
				event.preventDefault();
				handleBack();
			}
		},
		[query, depth, handleBack],
	);

	// cmdk executes the highlighted item on Enter even when a button inside a
	// frame has focus. Give controls such as the resource-row expander first
	// refusal, then prevent cmdk from also selecting the row.
	const handleRootKeyDown = useCallback((event: React.KeyboardEvent) => {
		if (event.key !== "Enter" || !(event.target instanceof HTMLElement)) {
			return;
		}
		const button = event.target.closest("button");
		if (!button) return;
		event.preventDefault();
		button.click();
	}, []);

	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	const placeholder = currentFrame
		? t("commandPalette.searchIn", { title: currentFrame.command.title })
		: t("commandPalette.search");

	const backButton = (
		<button
			type="button"
			onClick={handleBack}
			aria-label={t("navigation.back")}
			className="text-fg-mute hover:text-fg"
		>
			<ArrowLeftIcon className="size-4 shrink-0" />
		</button>
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="!max-w-[720px] sm:!max-w-[720px] translate-y-0 max-h-[80vh] overflow-hidden p-0"
				style={{ top: "max(16px, calc(50% - 278px))" }}
			>
				<DialogHeader className="sr-only">
					<DialogTitle>{t("commandPalette.title")}</DialogTitle>
					<DialogDescription>
						{t("commandPalette.description")}
					</DialogDescription>
				</DialogHeader>
				<Command
					onKeyDown={handleRootKeyDown}
					shouldFilter={!currentFrame || !currentFrame.command.renderFrame}
					className="[&_[cmdk-group-heading]]:text-fg-mute **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5 [&_[cmdk-list]]:max-h-[min(500px,calc(80vh-3rem))]"
				>
					<CommandInput
						value={query}
						onValueChange={setQuery}
						placeholder={placeholder}
						onKeyDown={handleKeyDown}
						leading={depth > 0 ? backButton : undefined}
					/>
					<QueryContext.Provider value={query}>
						{currentFrame ? (
							<SubPaletteView
								parent={currentFrame.command}
								onSelect={handleSelect}
							/>
						) : (
							<CommandListView onSelect={handleSelect} />
						)}
					</QueryContext.Provider>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
