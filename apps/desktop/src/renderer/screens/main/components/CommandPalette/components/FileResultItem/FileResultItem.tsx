import { CommandPrimitive } from "@superset/ui/command";
import { FileIcon } from "renderer/lib/fileIcons";

interface FileResultItemProps {
	value: string;
	fileName: string;
	relativePath: string;
	onSelect: () => void;
}

export function FileResultItem({
	value,
	fileName,
	relativePath,
	onSelect,
}: FileResultItemProps) {
	return (
		<CommandPrimitive.Item
			value={value}
			onSelect={onSelect}
			className="group data-[selected=true]:bg-accent-tint data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-fg-mute relative flex cursor-default items-center gap-2 rounded-sm px-2 py-2 text-sm outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
		>
			<FileIcon fileName={fileName} className="size-3.5 shrink-0" />
			<span className="max-w-[252px] truncate font-medium">{fileName}</span>
			<span className="truncate text-fg-mute text-xs">{relativePath}</span>
			<kbd className="ml-auto hidden shrink-0 text-xs text-fg-mute group-data-[selected=true]:block">
				↵
			</kbd>
		</CommandPrimitive.Item>
	);
}
