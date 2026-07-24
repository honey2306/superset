import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useCallback } from "react";
import { useV2UserPreferences } from "renderer/hooks/useV2UserPreferences";
import {
	actionLabel,
	type LinkAction,
	type LinkTierMap,
} from "renderer/lib/clickPolicy";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { LinkTierMapper } from "../LinkTierMapper";

const PORT_ACTIONS: LinkAction[] = ["pane", "newTab", "external"];

interface LinksSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function LinksSettings({ visibleItems }: LinksSettingsProps) {
	const { t } = useTranslation();
	const {
		preferences,
		setFileLinks,
		setUrlLinks,
		setSidebarFileLinks,
		setPortOpenAction,
	} = useV2UserPreferences();

	const showFile = isItemVisible(SETTING_ITEM_ID.LINKS_FILE, visibleItems);
	const showUrl = isItemVisible(SETTING_ITEM_ID.LINKS_URL, visibleItems);
	const showSidebar = isItemVisible(
		SETTING_ITEM_ID.LINKS_SIDEBAR_FILE,
		visibleItems,
	);
	const showPort = isItemVisible(SETTING_ITEM_ID.LINKS_PORT, visibleItems);

	const handleFileChange = useCallback(
		(next: LinkTierMap) => {
			setFileLinks(next);
			toast.success(t("common.changesSaved"));
		},
		[setFileLinks, t],
	);

	const handleUrlChange = useCallback(
		(next: LinkTierMap) => {
			setUrlLinks(next);
			toast.success(t("common.changesSaved"));
		},
		[setUrlLinks, t],
	);

	const handleSidebarChange = useCallback(
		(next: LinkTierMap) => {
			setSidebarFileLinks(next);
			toast.success(t("common.changesSaved"));
		},
		[setSidebarFileLinks, t],
	);

	const handlePortChange = useCallback(
		(next: LinkAction) => {
			setPortOpenAction(next);
			toast.success(t("common.changesSaved"));
		},
		[setPortOpenAction, t],
	);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">{t("settings.links")}</h2>
				<p className="text-sm text-muted-foreground mt-1">
					{t("links.description")}
				</p>
			</div>

			<div className="space-y-6">
				{showSidebar && (
					<LinkTierMapper
						title={t("links.sidebarRows")}
						description={t("links.sidebarRowsDescription")}
						value={preferences.sidebarFileLinks}
						onChange={handleSidebarChange}
						idPrefix="links-sidebar-file"
						surface="file"
					/>
				)}

				{showPort && (
					<div>
						<h3 className="text-sm font-medium mb-1">{t("ports.title")}</h3>
						<p className="text-xs text-muted-foreground mb-3">
							{t("links.portsDescription")}
						</p>
						<div className="flex items-center justify-between gap-4">
							<Label
								htmlFor="links-port-action"
								className="text-sm font-medium"
							>
								{t("links.onClick")}
							</Label>
							<Select
								value={preferences.portOpenAction}
								onValueChange={(v) => handlePortChange(v as LinkAction)}
							>
								<SelectTrigger
									id="links-port-action"
									size="sm"
									className="w-44"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PORT_ACTIONS.map((action) => (
										<SelectItem key={action} value={action}>
											{actionLabel(action, "url", t)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				)}

				{showFile && (
					<LinkTierMapper
						title={t("links.fileLinks")}
						description={t("links.fileLinksDescription")}
						value={preferences.fileLinks}
						onChange={handleFileChange}
						idPrefix="links-file"
						surface="file"
					/>
				)}

				{showUrl && (
					<LinkTierMapper
						title={t("links.urlLinks")}
						description={t("links.urlLinksDescription")}
						value={preferences.urlLinks}
						onChange={handleUrlChange}
						idPrefix="links-url"
						surface="url"
					/>
				)}
			</div>
		</div>
	);
}
