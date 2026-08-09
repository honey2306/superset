import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { cn } from "@superset/ui/utils";
import { HiMiniCommandLine } from "react-icons/hi2";
import { LuCheck, LuChevronDown, LuPlus } from "react-icons/lu";
import { getPresetIcon } from "renderer/assets/app-icons/preset-icons";
import { useTranslation } from "renderer/providers/I18nProvider";

export interface QuickAddAgentPill {
	agentId: string;
	iconId?: string;
	label: string;
	description: string;
	commands: string[];
}

interface QuickAddPresetsProps {
	pills: QuickAddAgentPill[];
	isDark: boolean;
	isAddDisabled?: boolean;
	keepOpenOnAdd?: boolean;
	isPillAdded: (pill: QuickAddAgentPill) => boolean;
	onAddPill: (pill: QuickAddAgentPill) => void;
}

export function QuickAddPresets({
	pills,
	isDark,
	isAddDisabled,
	keepOpenOnAdd,
	isPillAdded,
	onAddPill,
}: QuickAddPresetsProps) {
	const { t } = useTranslation();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					size="sm"
					variant="outline"
					disabled={isAddDisabled || pills.length === 0}
				>
					<LuPlus className="size-4" />
					{t("terminal.importAgent")}
					<LuChevronDown className="size-4 opacity-60" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-80">
				{pills.map((pill) => {
					const alreadyAdded = isPillAdded(pill);
					const icon = getPresetIcon(pill.iconId ?? pill.agentId, isDark);
					return (
						<DropdownMenuItem
							key={pill.agentId}
							disabled={alreadyAdded}
							onSelect={(event) => {
								if (alreadyAdded) {
									event.preventDefault();
									return;
								}
								if (keepOpenOnAdd) {
									event.preventDefault();
								}
								onAddPill(pill);
							}}
							className={cn(
								"flex items-start gap-3 py-2",
								alreadyAdded && "opacity-60",
							)}
						>
							<div className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
								{icon ? (
									<img src={icon} alt="" className="size-4 object-contain" />
								) : (
									<HiMiniCommandLine className="size-4 text-fg-mute" />
								)}
							</div>
							<div className="min-w-0 flex-1">
								<div className="text-sm font-medium leading-tight">
									{pill.label}
								</div>
								{pill.description && (
									<div className="text-xs text-fg-mute mt-0.5 line-clamp-2">
										{pill.description}
									</div>
								)}
							</div>
							{alreadyAdded && (
								<LuCheck className="size-4 shrink-0 text-fg-mute mt-0.5" />
							)}
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
