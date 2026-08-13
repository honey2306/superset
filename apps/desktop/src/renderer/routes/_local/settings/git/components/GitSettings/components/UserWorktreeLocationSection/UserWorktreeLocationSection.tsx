import { Label } from "@superset/ui/label";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import {
	useSetWorktreeBaseDir,
	useWorktreeLocationSettings,
	WorktreeLocationPicker,
} from "renderer/routes/_local/settings/components/WorktreeLocationPicker";

export function UserWorktreeLocationSection() {
	const { t } = useTranslation();
	const { activeHostUrl } = useLocalHostService();
	const settingsQuery = useWorktreeLocationSettings(activeHostUrl, {
		enabled: !!activeHostUrl,
	});
	const setLocation = useSetWorktreeBaseDir(activeHostUrl);
	const disabled =
		!activeHostUrl || settingsQuery.isLoading || setLocation.isPending;

	return (
		<div className="space-y-2">
			<div className="space-y-0.5">
				<Label className="text-sm font-medium">
					{t("git.worktreeLocation")}
				</Label>
				<p className="text-xs text-fg-mute">{t("git.baseDirectory")}</p>
			</div>
			<WorktreeLocationPicker
				currentPath={settingsQuery.data?.worktreeBaseDir ?? null}
				fallbackPath={settingsQuery.data?.defaultWorktreeBaseDir ?? null}
				hostUrl={activeHostUrl}
				disabled={disabled}
				browseTitle={t("git.selectWorktreeLocation")}
				onSelect={(path) => setLocation.mutate(path)}
				onReset={() => setLocation.mutate(null)}
			/>
		</div>
	);
}
