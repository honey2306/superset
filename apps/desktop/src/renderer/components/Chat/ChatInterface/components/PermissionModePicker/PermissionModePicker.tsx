import { PromptInputButton } from "@superset/ui/ai-elements/prompt-input";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { LucideIcon } from "lucide-react";
import {
	CheckIcon,
	ChevronDownIcon,
	ShieldCheckIcon,
	ShieldIcon,
	ShieldOffIcon,
} from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { PILL_BUTTON_CLASS } from "../../styles";
import type { PermissionMode } from "../../types";

interface PermissionModeOption {
	value: PermissionMode;
	label: string;
	description: string;
	icon: LucideIcon;
}

export function PermissionModePicker({
	selectedMode,
	onSelectMode,
}: {
	selectedMode: PermissionMode;
	onSelectMode: (mode: PermissionMode) => void;
}) {
	const { t } = useTranslation();

	const permissionModes: PermissionModeOption[] = [
		{
			value: "bypassPermissions",
			label: t("permissionMode.auto"),
			description: t("permissionMode.autoDescription"),
			icon: ShieldOffIcon,
		},
		{
			value: "acceptEdits",
			label: t("permissionMode.semiAuto"),
			description: t("permissionMode.semiAutoDescription"),
			icon: ShieldCheckIcon,
		},
		{
			value: "default",
			label: t("permissionMode.manual"),
			description: t("permissionMode.manualDescription"),
			icon: ShieldIcon,
		},
	];

	const active =
		permissionModes.find((m) => m.value === selectedMode) ?? permissionModes[0];
	const ActiveIcon = active.icon;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<PromptInputButton
					className={`${PILL_BUTTON_CLASS} px-2 gap-1 text-xs text-fg`}
				>
					<ActiveIcon className="size-3.5 opacity-60" />
					<span>{active.label}</span>
					<ChevronDownIcon className="size-2.5 opacity-50" />
				</PromptInputButton>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				{permissionModes.map((mode) => {
					const Icon = mode.icon;
					const isActive = mode.value === selectedMode;
					return (
						<DropdownMenuItem
							key={mode.value}
							onClick={() => onSelectMode(mode.value)}
							className="flex items-center gap-2"
						>
							<Icon className="size-4 shrink-0" />
							<div className="flex flex-1 flex-col gap-0.5">
								<span className="text-sm font-medium">{mode.label}</span>
								<span className="text-xs text-fg-mute">{mode.description}</span>
							</div>
							{isActive && <CheckIcon className="size-4 shrink-0" />}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
