import { HiMiniMinus, HiMiniStop, HiMiniXMark } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

export function WindowControls() {
	const { t } = useTranslation();
	const minimizeMutation = electronTrpc.window.minimize.useMutation();
	const maximizeMutation = electronTrpc.window.maximize.useMutation();
	const closeMutation = electronTrpc.window.close.useMutation();

	const handleMinimize = () => {
		minimizeMutation.mutate();
	};

	const handleMaximize = () => {
		maximizeMutation.mutate();
	};

	const handleClose = () => {
		closeMutation.mutate();
	};

	return (
		<div className="no-drag flex items-center h-full gap-1 pr-1">
			<button
				type="button"
				aria-label={t("dashboard.minimizeWindow")}
				className="no-drag flex h-8 w-8 items-center justify-center rounded-ds-3 text-fg-mute transition-colors hover:bg-hover hover:text-fg"
				onClick={handleMinimize}
			>
				<HiMiniMinus className="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				aria-label={t("dashboard.maximizeWindow")}
				className="no-drag flex h-8 w-8 items-center justify-center rounded-ds-3 text-fg-mute transition-colors hover:bg-hover hover:text-fg"
				onClick={handleMaximize}
			>
				<HiMiniStop className="h-3 w-3" />
			</button>
			<button
				type="button"
				aria-label={t("dashboard.closeWindow")}
				className="no-drag flex h-8 w-8 items-center justify-center rounded-ds-3 text-fg-mute transition-colors hover:bg-destructive hover:text-destructive-foreground"
				onClick={handleClose}
			>
				<HiMiniXMark className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}
