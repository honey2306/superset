import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

const VOLUME_LEVELS = [20, 40, 60, 80, 100] as const;

export function VolumeDropdown() {
	const { t } = useTranslation();
	const volumeLabels = {
		20: t("ringtones.volumeQuiet"),
		40: t("ringtones.volumeLow"),
		60: t("ringtones.volumeMedium"),
		80: t("ringtones.volumeHigh"),
		100: t("ringtones.volumeMaximum"),
	} as const;
	const utils = electronTrpc.useUtils();
	const { data: volumeData, isLoading: volumeLoading } =
		electronTrpc.settings.getNotificationVolume.useQuery();
	const volume = volumeData ?? 100;

	const setVolume = electronTrpc.settings.setNotificationVolume.useMutation({
		onMutate: async ({ volume }) => {
			await utils.settings.getNotificationVolume.cancel();
			const previous = utils.settings.getNotificationVolume.getData();
			utils.settings.getNotificationVolume.setData(undefined, volume);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getNotificationVolume.setData(
					undefined,
					context.previous,
				);
			}
		},
		onSettled: async () => {
			await utils.settings.getNotificationVolume.invalidate();
		},
	});

	const handleVolumeChange = useCallback(
		(value: string) => {
			const newVolume = Number.parseInt(value, 10);
			setVolume.mutate({ volume: newVolume });
		},
		[setVolume],
	);

	return (
		<div>
			<div className="flex items-center justify-between gap-4">
				<Label htmlFor="notification-volume" className="text-sm font-medium">
					{t("ringtones.volume")}
				</Label>
				<Select
					value={volume.toString()}
					onValueChange={handleVolumeChange}
					disabled={volumeLoading}
				>
					<SelectTrigger id="notification-volume" className="w-[200px]">
						<SelectValue>
							<span className="flex items-center gap-2">
								<span className="font-medium">
									{volumeLabels[volume as keyof typeof volumeLabels] ??
										t("ringtones.volumeCustom")}
								</span>
								<span className="text-fg-mute">({volume}%)</span>
							</span>
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{VOLUME_LEVELS.map((level) => (
							<SelectItem key={level} value={level.toString()}>
								<div className="flex items-center gap-2">
									<span className="font-medium">{volumeLabels[level]}</span>
									<span className="text-fg-mute text-xs">({level}%)</span>
								</div>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</div>
	);
}
