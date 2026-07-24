import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useState } from "react";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { ExposeViaRelayConfirmDialog } from "renderer/routes/_authenticated/components/ExposeViaRelayConfirmDialog";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface SecuritySettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function SecuritySettings({ visibleItems }: SecuritySettingsProps) {
	const { t } = useTranslation();
	const showRelayToggle = isItemVisible(
		SETTING_ITEM_ID.SECURITY_EXPOSE_HOST_SERVICE_VIA_RELAY,
		visibleItems,
	);

	const utils = electronTrpc.useUtils();
	const { data: exposeEnabled, isLoading } =
		electronTrpc.settings.getExposeHostServiceViaRelay.useQuery();

	const setExpose =
		electronTrpc.settings.setExposeHostServiceViaRelay.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getExposeHostServiceViaRelay.cancel();
				const previous = utils.settings.getExposeHostServiceViaRelay.getData();
				utils.settings.getExposeHostServiceViaRelay.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getExposeHostServiceViaRelay.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getExposeHostServiceViaRelay.invalidate();
			},
		});

	const [confirmOpen, setConfirmOpen] = useState(false);
	const [confirmTargetEnabled, setConfirmTargetEnabled] = useState(false);
	const { gateFeature } = usePaywall();

	const runToggle = (enabled: boolean) => {
		toast.promise(setExpose.mutateAsync({ enabled }), {
			loading: t("security.restartingServices"),
			success: ({ restartedOrgCount }) =>
				restartedOrgCount > 0
					? t("security.servicesRestarted", { count: restartedOrgCount })
					: t("security.settingSaved"),
			error: (err: Error) => err.message ?? t("security.settingUpdateFailed"),
		});
	};

	const openConfirm = (next: boolean) => {
		setConfirmTargetEnabled(next);
		setConfirmOpen(true);
	};

	const handleChange = (next: boolean) => {
		if (next) {
			gateFeature(GATED_FEATURES.REMOTE_WORKSPACES, () => openConfirm(true));
		} else {
			openConfirm(false);
		}
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">{t("settings.security")}</h2>
				<p className="text-sm text-muted-foreground mt-1">
					{t("security.description")}
				</p>
			</div>

			{showRelayToggle && (
				<div className="flex items-start justify-between gap-6">
					<div className="space-y-1 flex-1">
						<Label
							htmlFor="expose-host-service-via-relay"
							className="text-sm font-medium"
						>
							{t("security.relayAccess")}
						</Label>
						<p className="text-xs text-muted-foreground">
							{t("security.relayAccessDescription")}
						</p>
					</div>
					<Switch
						id="expose-host-service-via-relay"
						checked={exposeEnabled ?? false}
						onCheckedChange={handleChange}
						disabled={isLoading || setExpose.isPending}
					/>
				</div>
			)}

			<ExposeViaRelayConfirmDialog
				open={confirmOpen}
				targetEnabled={confirmTargetEnabled}
				onOpenChange={setConfirmOpen}
				onConfirm={() => {
					const enabled = confirmTargetEnabled;
					setConfirmOpen(false);
					runToggle(enabled);
				}}
			/>
		</div>
	);
}
