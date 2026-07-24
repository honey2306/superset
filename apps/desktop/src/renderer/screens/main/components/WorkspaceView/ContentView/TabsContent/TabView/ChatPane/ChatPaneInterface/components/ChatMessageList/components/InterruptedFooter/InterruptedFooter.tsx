import { useTranslation } from "renderer/providers/I18nProvider";

export function InterruptedFooter() {
	const { t } = useTranslation();
	return (
		<div className="flex items-center gap-2 text-xs text-muted-foreground">
			<span className="rounded border border-border bg-muted px-1.5 py-0.5 font-medium uppercase tracking-wide">
				{t("chat.interrupted")}
			</span>
			<span>{t("chat.responseStopped")}</span>
		</div>
	);
}
