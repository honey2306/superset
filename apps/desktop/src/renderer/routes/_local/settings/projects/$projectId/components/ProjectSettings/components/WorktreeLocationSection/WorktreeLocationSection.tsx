import { toast } from "@superset/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	useWorktreeLocationSettings,
	WorktreeLocationPicker,
} from "../../../../../../components/WorktreeLocationPicker";

interface WorktreeLocationSectionProps {
	projectId: string;
	currentPath: string | null;
	hostUrl: string | null;
	isHostOnline: boolean;
	isProjectSetup: boolean;
	onChanged?: () => void;
}

export function WorktreeLocationSection({
	projectId,
	currentPath,
	hostUrl,
	isHostOnline,
	isProjectSetup,
	onChanged,
}: WorktreeLocationSectionProps) {
	const { t } = useTranslation();
	const hostSettingsQuery = useWorktreeLocationSettings(hostUrl, {
		enabled: isHostOnline,
	});

	const setLocation = useMutation({
		mutationFn: async (path: string | null) => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(
				hostUrl,
			).project.setWorktreeBaseDir.mutate({ projectId, path });
		},
		onSuccess: (_data, path) => {
			toast.success(
				path
					? t("project.worktreeLocationUpdated")
					: t("project.worktreeLocationReset"),
			);
			onChanged?.();
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : String(err));
		},
	});

	return (
		<WorktreeLocationPicker
			currentPath={currentPath}
			fallbackPath={
				hostSettingsQuery.data?.worktreeBaseDir ??
				hostSettingsQuery.data?.defaultWorktreeBaseDir ??
				null
			}
			hostUrl={hostUrl}
			disabled={
				!hostUrl ||
				!isHostOnline ||
				!isProjectSetup ||
				hostSettingsQuery.isLoading ||
				setLocation.isPending
			}
			browseTitle={t("project.selectProjectWorktreeLocation")}
			onSelect={(path) => setLocation.mutate(path)}
			onReset={() => setLocation.mutate(null)}
		/>
	);
}
