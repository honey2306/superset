import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuCheck, LuFile, LuFolder, LuX } from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";
import { TREE_INDENT } from "../../constants";
import type { NewItemMode } from "../../types";

interface NewItemInputProps {
	mode: NewItemMode;
	parentPath: string;
	onSubmit: (name: string) => void;
	onCancel: () => void;
	level?: number;
}

export function NewItemInput({
	mode,
	parentPath: _parentPath,
	onSubmit,
	onCancel,
	level = 0,
}: NewItemInputProps) {
	const { t } = useTranslation();
	const [value, setValue] = useState("");

	const handleSubmit = () => {
		const trimmed = value.trim();
		if (trimmed) {
			onSubmit(trimmed);
		} else {
			onCancel();
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		e.stopPropagation();
		if (e.key === "Enter") {
			e.preventDefault();
			handleSubmit();
		}
		if (e.key === "Escape") {
			e.preventDefault();
			onCancel();
		}
	};

	const isFolder = mode === "folder";
	const Icon = isFolder ? LuFolder : LuFile;

	return (
		<div
			className={cn("flex items-center gap-1 px-1 h-7", "bg-accent-tint rounded-sm")}
			style={{ paddingLeft: `${level * TREE_INDENT + 4}px` }}
		>
			<span className="w-4 h-4 shrink-0" />
			<Icon className="size-4 shrink-0 text-warning" />
			<input
				type="text"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={handleKeyDown}
				placeholder={
					isFolder
						? t("files.newFolderPlaceholder")
						: t("files.newFilePlaceholder")
				}
				className={cn(
					"flex-1 min-w-0 px-1 py-0 text-xs",
					"bg-background border border-ring rounded outline-none",
				)}
			/>
			<button
				type="button"
				onClick={handleSubmit}
				className="p-0.5 hover:bg-background/50 rounded"
			>
				<LuCheck className="size-3 text-fg-mute" />
			</button>
			<button
				type="button"
				onMouseDown={(e) => {
					e.preventDefault();
					onCancel();
				}}
				className="p-0.5 hover:bg-background/50 rounded"
			>
				<LuX className="size-3 text-fg-mute" />
			</button>
		</div>
	);
}
