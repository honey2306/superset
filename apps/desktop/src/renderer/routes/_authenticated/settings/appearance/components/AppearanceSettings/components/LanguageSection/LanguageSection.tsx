import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import {
	type Locale,
	SUPPORTED_LOCALES,
	useTranslation,
} from "renderer/providers/I18nProvider";

export function LanguageSection() {
	const { locale, setLocale, t } = useTranslation();

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">{t("language.name")}</h3>
			<p className="text-xs text-muted-foreground mb-3">
				{t("language.description")}
			</p>
			<Select
				value={locale}
				onValueChange={(value) => setLocale(value as Locale)}
			>
				<SelectTrigger className="w-[200px]" aria-label={t("language.name")}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{SUPPORTED_LOCALES.map((supportedLocale) => (
						<SelectItem key={supportedLocale} value={supportedLocale}>
							{supportedLocale === "zh-CN"
								? t("language.chineseSimplified")
								: t("language.english")}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}
