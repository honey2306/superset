import { ToggleGroup, ToggleGroupItem } from "@superset/ui/toggle-group";
import { LuColumns2, LuPanelTopOpen } from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { AgentSessionPlacement } from "../../hooks/useDiffCommentTarget";

interface AgentPlacementToggleProps {
	value: AgentSessionPlacement;
	onValueChange: (next: string) => void;
}

export function AgentPlacementToggle({
	value,
	onValueChange,
}: AgentPlacementToggleProps) {
	const { t } = useTranslation();
	return (
		<ToggleGroup
			type="single"
			size="sm"
			value={value}
			onValueChange={onValueChange}
			className="ml-1 h-7 gap-0 rounded-md border border-border/60 bg-popover p-0.5"
		>
			<ToggleGroupItem
				value="split-pane"
				aria-label={t("v2Workspace.agentPlacement.splitAria")}
				title={t("v2Workspace.agentPlacement.split")}
				className="h-6 gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
			>
				<LuColumns2 className="size-3" />
				<span>{t("v2Workspace.agentPlacement.split")}</span>
			</ToggleGroupItem>
			<ToggleGroupItem
				value="new-tab"
				aria-label={t("v2Workspace.agentPlacement.newTabAria")}
				title={t("v2Workspace.agentPlacement.newTab")}
				className="h-6 gap-1 rounded-sm px-1.5 text-[11px] text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-foreground"
			>
				<LuPanelTopOpen className="size-3" />
				<span>{t("v2Workspace.agentPlacement.newTab")}</span>
			</ToggleGroupItem>
		</ToggleGroup>
	);
}
