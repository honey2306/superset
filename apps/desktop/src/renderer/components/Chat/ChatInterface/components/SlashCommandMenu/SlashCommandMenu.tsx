import { PopoverContent } from "@superset/ui/popover";
import { useEffect, useRef } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	type ComposerSlashCommand,
	getSlashCommandSelectionBehavior,
} from "../../hooks/useSlashCommands";

interface SlashCommandMenuProps<T extends ComposerSlashCommand> {
	commands: T[];
	selectedIndex: number;
	onSelect: (command: T) => void;
	onHover: (index: number) => void;
}

export function SlashCommandMenu<T extends ComposerSlashCommand>({
	commands,
	selectedIndex,
	onSelect,
	onHover,
}: SlashCommandMenuProps<T>) {
	const { t } = useTranslation();
	const selectedRef = useRef<HTMLButtonElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: must scroll when selectedIndex changes
	useEffect(() => {
		selectedRef.current?.scrollIntoView({ block: "nearest" });
	}, [selectedIndex]);

	if (commands.length === 0) return null;

	return (
		<PopoverContent
			side="top"
			align="start"
			sideOffset={4}
			className="w-[var(--radix-popover-trigger-width)] overflow-hidden border-accent-solid/35 bg-surface-sunk/95 p-0 text-xs shadow-xl"
			onOpenAutoFocus={(e) => e.preventDefault()}
			onCloseAutoFocus={(e) => e.preventDefault()}
		>
			<div
				className="max-h-[200px] overflow-y-auto p-1"
				role="listbox"
				aria-label="Slash commands"
			>
				{commands.map((cmd, index) => {
					const isSelected = index === selectedIndex;
					const behavior = getSlashCommandSelectionBehavior(cmd);
					return (
						<button
							key={cmd.name}
							ref={isSelected ? selectedRef : undefined}
							type="button"
							role="option"
							aria-selected={isSelected}
							className={`relative flex w-full cursor-pointer items-center rounded-sm px-3 py-2 text-left text-fg outline-none transition-colors before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-accent-solid before:transition-opacity before:content-[''] ${
								isSelected
									? "bg-accent-tint before:opacity-100"
									: "before:opacity-0 hover:bg-hover/40"
							}`}
							onMouseEnter={() => onHover(index)}
							onMouseDown={(e) => {
								e.preventDefault();
								onSelect(cmd);
							}}
						>
							<div className="flex w-full min-w-0 items-center gap-2">
								<span className="min-w-[80px] shrink-0 font-semibold text-accent-solid">
									<span className="font-mono font-normal text-accent-solid/60">
										/
									</span>
									{cmd.name}
								</span>
								<span className="ml-auto flex shrink-0 items-center gap-2 pl-3 font-mono text-[10px] text-fg-mute">
									{cmd.kind === "builtin" && (
										<span className="rounded-sm border border-line/70 bg-hover/40 px-1 py-0.5 uppercase leading-none">
											{t("slashCommand.builtin")}
										</span>
									)}
									<span>
										{behavior === "choose"
											? cmd.argumentOptions?.length
												? `${cmd.argumentOptions.length} options  ›`
												: "choose  ›"
											: behavior === "input"
												? "type argument  ↵"
												: "run  ↵"}
									</span>
								</span>
							</div>
						</button>
					);
				})}
			</div>
		</PopoverContent>
	);
}
