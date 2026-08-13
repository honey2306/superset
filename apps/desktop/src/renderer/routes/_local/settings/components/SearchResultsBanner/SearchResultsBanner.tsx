import { HiXMark } from "react-icons/hi2";
import { useTranslation } from "renderer/providers/I18nProvider";

interface SearchResultsBannerProps {
	query: string;
	matchCount: number;
	onClear: () => void;
}

export function SearchResultsBanner({
	query,
	matchCount,
	onClear,
}: SearchResultsBannerProps) {
	const { t } = useTranslation();
	const hasMatches = matchCount > 0;

	return (
		<div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-background/95 px-6 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85">
			<p className="flex-1 truncate text-xs text-fg-mute">
				{hasMatches
					? matchCount === 1
						? t("settingsSearch.oneResult", { query })
						: t("settingsSearch.results", { count: matchCount, query })
					: t("settingsSearch.noResults", { query })}
			</p>
			<button
				type="button"
				onClick={onClear}
				aria-label={t("settingsSearch.clear")}
				className="shrink-0 rounded-sm p-0.5 text-fg-mute hover:text-fg transition-colors"
			>
				<HiXMark className="h-3.5 w-3.5" />
			</button>
		</div>
	);
}
