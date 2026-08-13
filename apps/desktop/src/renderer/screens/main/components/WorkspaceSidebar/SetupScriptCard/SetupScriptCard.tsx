import { SidebarCard } from "@superset/ui/sidebar-card";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useHostProjectSetupCard } from "renderer/hooks/host-service/useHostProjectConfig";
import { useTranslation } from "renderer/providers/I18nProvider";

interface SetupScriptCardProps {
	isCollapsed?: boolean;
	projectId: string | null;
	projectName: string | null;
}

const DISMISSED_SETUP_CARD_PREFIX = "superset:setup-card-dismissed:";

export function SetupScriptCard({
	isCollapsed,
	projectId,
	projectName,
}: SetupScriptCardProps) {
	const { t } = useTranslation();
	const { data: hasEmptyConfig } = useHostProjectSetupCard(projectId ?? "");
	const storageKey = `${DISMISSED_SETUP_CARD_PREFIX}${projectId ?? ""}`;
	const [isDismissed, setIsDismissed] = useState(() =>
		Boolean(projectId && localStorage.getItem(storageKey) === "true"),
	);
	useEffect(() => {
		setIsDismissed(
			Boolean(projectId && localStorage.getItem(storageKey) === "true"),
		);
	}, [projectId, storageKey]);
	const navigate = useNavigate();

	if (
		isCollapsed ||
		!projectId ||
		!projectName ||
		!hasEmptyConfig ||
		isDismissed
	) {
		return null;
	}

	const handleDismiss = () => {
		localStorage.setItem(storageKey, "true");
		setIsDismissed(true);
	};

	return (
		<AnimatePresence>
			<motion.div
				key={projectId}
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: 10 }}
				transition={{ duration: 0.2 }}
				className="px-3 pb-2"
			>
				<SidebarCard
					badge={t("workspace.setupBadge")}
					title={t("workspace.setupScripts")}
					description={t("workspace.automateSetupFor", {
						project: projectName,
					})}
					actionLabel={t("workspace.configure")}
					onAction={() =>
						navigate({
							to: "/settings/projects/$projectId",
							params: { projectId },
						})
					}
					onDismiss={handleDismiss}
				/>
			</motion.div>
		</AnimatePresence>
	);
}
