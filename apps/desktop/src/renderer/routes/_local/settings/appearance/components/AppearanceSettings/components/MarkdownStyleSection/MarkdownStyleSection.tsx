import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	type MarkdownStyle,
	useMarkdownStyle,
	useSetMarkdownStyle,
} from "renderer/stores";

export function MarkdownStyleSection() {
	const { t } = useTranslation();
	const markdownStyle = useMarkdownStyle();
	const setMarkdownStyle = useSetMarkdownStyle();

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">
				{t("appearance.markdownStyle")}
			</h3>
			<p className="text-xs text-fg-mute mb-3">
				{t("appearance.markdownStyleDescription")}
			</p>
			<Select
				value={markdownStyle}
				onValueChange={(value) => setMarkdownStyle(value as MarkdownStyle)}
			>
				<SelectTrigger
					className="w-[200px]"
					aria-label={t("appearance.markdownStyle")}
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="default">{t("appearance.default")}</SelectItem>
					<SelectItem value="tufte">Tufte</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
