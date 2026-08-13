import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useAcpForAgentPresets } from "renderer/screens/main/components/WorkspaceView/ContentView/hooks/useAcpForAgentPresets";

export function AcpPresetLaunchSetting() {
	const { t } = useTranslation();
	const { useAcpForAgentPresets: enabled, setUseAcpForAgentPresets } =
		useAcpForAgentPresets();

	return (
		<div className="flex items-center justify-between gap-10">
			<div className="space-y-1">
				<Label htmlFor="acp-preset-launch" className="text-sm font-medium">
					{t("terminal.acpPresetLaunch")}
				</Label>
				<p className="text-xs text-fg-mute max-w-md leading-relaxed">
					{t("terminal.acpPresetLaunchDescription")}
				</p>
			</div>
			<Switch
				id="acp-preset-launch"
				checked={enabled ?? false}
				onCheckedChange={(next) =>
					setUseAcpForAgentPresets.mutate({ enabled: next })
				}
				disabled={setUseAcpForAgentPresets.isPending}
			/>
		</div>
	);
}
