import type { TerminalPreset } from "@superset/shared/desktop-types";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { useCallback, useRef, useState } from "react";
import { HiMiniCommandLine } from "react-icons/hi2";
import { LuTrash2, LuUpload } from "react-icons/lu";
import {
	hasBuiltInPresetIcon,
	isDataImageUri,
	resolvePresetIcon,
} from "renderer/assets/app-icons/preset-icons";
import { useTranslation } from "renderer/providers/I18nProvider";

const ACCEPTED_MIME_TYPES = "image/png,image/jpeg,image/webp,image/svg+xml";
const MAX_SIZE_MB = 2;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

interface PresetIconFieldProps {
	preset: TerminalPreset;
	isDark: boolean;
	onChange: (icon: string | undefined) => void;
}

/**
 * Checks if the name matches any built-in icon key
 */
function hasBuiltInIcon(name: string): boolean {
	return hasBuiltInPresetIcon(name);
}

export function PresetIconField({
	preset,
	isDark,
	onChange,
}: PresetIconFieldProps) {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isPending, setIsPending] = useState(false);

	const iconUrl = resolvePresetIcon(preset.name, preset.icon, isDark);
	const hasBuiltIn = hasBuiltInIcon(preset.name);
	const hasCustomIcon = Boolean(preset.icon && isDataImageUri(preset.icon));

	const handleClickUpload = useCallback(() => {
		if (!fileInputRef.current) return;
		fileInputRef.current.value = "";
		fileInputRef.current.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			e.target.value = "";
			if (!file) return;

			if (file.size > MAX_SIZE_BYTES) {
				const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
				toast.error(
					t("project.fileTooLarge", { size: sizeInMB, max: MAX_SIZE_MB }),
				);
				return;
			}

			setIsPending(true);
			const reader = new FileReader();
			reader.onerror = () => {
				toast.error(t("project.couldNotReadFile"));
				setIsPending(false);
			};
			reader.onabort = () => {
				setIsPending(false);
			};
			reader.onload = () => {
				const fileData = reader.result;
				if (typeof fileData !== "string") {
					toast.error(t("project.couldNotReadFile"));
					setIsPending(false);
					return;
				}
				onChange(fileData);
				setIsPending(false);
			};
			reader.readAsDataURL(file);
		},
		[onChange, t],
	);

	const handleRemove = useCallback(() => {
		onChange(undefined);
	}, [onChange]);

	const hasSecondaryActions = hasCustomIcon;

	const Thumbnail = (
		<button
			type="button"
			onClick={hasSecondaryActions ? undefined : handleClickUpload}
			disabled={isPending || hasBuiltIn}
			aria-label={
				hasBuiltIn
					? t("terminal.usingBuiltInIcon")
					: hasSecondaryActions
						? t("project.iconOptions")
						: iconUrl
							? t("project.replaceIcon")
							: t("project.uploadIcon")
			}
			className="size-9 rounded-ds-3 border overflow-hidden flex items-center justify-center text-fg-mute transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
		>
			{iconUrl ? (
				<img
					src={iconUrl}
					alt={t("project.iconAlt")}
					className="size-full object-contain p-1"
				/>
			) : (
				<HiMiniCommandLine className="size-4" />
			)}
		</button>
	);

	return (
		<div className="flex items-center gap-3">
			{hasSecondaryActions ? (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>{Thumbnail}</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-48">
						<DropdownMenuItem onSelect={handleClickUpload}>
							<LuUpload className="size-4" />
							{t("agents.uploadImage")}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive" onSelect={handleRemove}>
							<LuTrash2 className="size-4" />
							{t("project.removeIcon")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				Thumbnail
			)}
			<div className="flex-1 min-w-0">
				{hasBuiltIn ? (
					<>
						<p className="text-sm text-fg">{t("terminal.usingBuiltInIcon")}</p>
						<p className="text-xs text-fg-mute">
							{t("terminal.builtInIconHint", { name: preset.name })}
						</p>
					</>
				) : hasCustomIcon ? (
					<>
						<p className="text-sm text-fg">{t("terminal.customIcon")}</p>
						<p className="text-xs text-fg-mute">
							{t("terminal.customIconHint")}
						</p>
					</>
				) : (
					<>
						<p className="text-sm text-fg">{t("terminal.noIcon")}</p>
						<p className="text-xs text-fg-mute">
							{t("terminal.uploadIconHint")}
						</p>
					</>
				)}
			</div>
			<input
				ref={fileInputRef}
				type="file"
				accept={ACCEPTED_MIME_TYPES}
				className="hidden"
				onChange={handleFileChange}
			/>
		</div>
	);
}
