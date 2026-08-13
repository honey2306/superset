import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { AppearanceSettings } from "./components/AppearanceSettings";

export const Route = createFileRoute("/_local/settings/appearance/")({
	component: AppearanceSettingsPage,
});

function AppearanceSettingsPage() {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "appearance", locale).map(
			(item) => item.id,
		);
	}, [searchQuery, locale]);

	return <AppearanceSettings visibleItems={visibleItems} />;
}
