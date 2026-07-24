import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import {
	useIsV2CloudEnabled,
	useIsV2OnlyUser,
} from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	useInlineWorkspacePortsEnabled,
	useInlineWorkspacePortsStore,
} from "renderer/stores/inline-workspace-ports";
import { useOpenV1ImportModal } from "renderer/stores/v1-import-modal";
import { useV2LocalOverrideStore } from "renderer/stores/v2-local-override";
import {
	useWorkspaceAgentsRowEnabled,
	useWorkspaceAgentsRowStore,
} from "renderer/stores/workspace-agents-row";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface ExperimentalSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function ExperimentalSettings({
	visibleItems,
}: ExperimentalSettingsProps) {
	const { t } = useTranslation();
	const showSupersetV2 = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_SUPERSET_V2,
		visibleItems,
	);
	const showV1Migration = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION,
		visibleItems,
	);
	const showInlineWorkspacePorts = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_INLINE_WORKSPACE_PORTS,
		visibleItems,
	);
	const showWorkspaceAgents = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_WORKSPACE_AGENTS,
		visibleItems,
	);
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const isV2OnlyUser = useIsV2OnlyUser();
	const setOptInV2 = useV2LocalOverrideStore((state) => state.setOptInV2);
	const openV1ImportModal = useOpenV1ImportModal();
	const inlineWorkspacePortsEnabled = useInlineWorkspacePortsEnabled();
	const setInlineWorkspacePortsEnabled = useInlineWorkspacePortsStore(
		(state) => state.setEnabled,
	);
	const workspaceAgentsEnabled = useWorkspaceAgentsRowEnabled();
	const setWorkspaceAgentsEnabled = useWorkspaceAgentsRowStore(
		(state) => state.setEnabled,
	);

	return (
		<div className="p-6 max-w-4xl w-full mx-auto">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">{t("settings.experimental")}</h2>
				<p className="text-sm text-muted-foreground mt-1">
					{t("experimental.description")}
				</p>
			</div>

			<div className="space-y-6">
				{showSupersetV2 && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label htmlFor="superset-v2" className="text-sm font-medium">
								{t("experimental.tryV2")}
							</Label>
							<p className="text-xs text-muted-foreground">
								{t("experimental.tryV2Description")}
							</p>
						</div>
						<Switch
							id="superset-v2"
							checked={isV2CloudEnabled}
							onCheckedChange={(enabled) => {
								track("surface_toggled", {
									from: isV2CloudEnabled ? "v2" : "v1",
									to: enabled ? "v2" : "v1",
								});
								setOptInV2(enabled);
							}}
						/>
					</div>
				)}
				{showV1Migration && !isV2OnlyUser && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label className="text-sm font-medium">
								{t("experimental.importV1")}
							</Label>
							<p className="text-xs text-muted-foreground">
								{t("experimental.importV1Description")}
							</p>
							{!isV2CloudEnabled && (
								<p className="text-xs text-muted-foreground">
									{t("experimental.v2Required")}
								</p>
							)}
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => openV1ImportModal()}
							disabled={!isV2CloudEnabled}
							className="shrink-0"
						>
							{t("experimental.openImporter")}
						</Button>
					</div>
				)}
				{showInlineWorkspacePorts && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label
								htmlFor="inline-workspace-ports"
								className="text-sm font-medium"
							>
								{t("experimental.inlinePorts")}
							</Label>
							<p className="text-xs text-muted-foreground">
								{t("experimental.inlinePortsDescription")}
							</p>
						</div>
						<Switch
							id="inline-workspace-ports"
							checked={inlineWorkspacePortsEnabled}
							onCheckedChange={setInlineWorkspacePortsEnabled}
						/>
					</div>
				)}
				{showWorkspaceAgents && (
					<div className="flex items-center justify-between gap-6">
						<div className="min-w-0 flex-1 space-y-0.5">
							<Label htmlFor="workspace-agents" className="text-sm font-medium">
								{t("experimental.workspaceAgents")}
							</Label>
							<p className="text-xs text-muted-foreground">
								{t("experimental.workspaceAgentsDescription")}
							</p>
						</div>
						<Switch
							id="workspace-agents"
							checked={workspaceAgentsEnabled}
							onCheckedChange={setWorkspaceAgentsEnabled}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
