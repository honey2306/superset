import { UploadIcon } from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";

interface FileDropOverlayProps {
	visible: boolean;
}

export function FileDropOverlay({ visible }: FileDropOverlayProps) {
	const { t } = useTranslation();
	if (!visible) return null;

	return (
		<div className="mx-3 mt-3 flex self-stretch flex-col items-center gap-2 bg-hover py-6">
			<div className="flex size-8 items-center justify-center rounded-full bg-muted-foreground/20">
				<UploadIcon className="size-4 text-fg-mute" />
			</div>
			<p className="font-medium text-fg text-sm">
				{t("fileDrop.title")}
			</p>
			<p className="text-fg-mute text-xs">{t("fileDrop.subtitle")}</p>
		</div>
	);
}
