import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { ModelsSettings } from "./components/ModelsSettings";

export const Route = createFileRoute("/_local/settings/models/")({
	component: ModelsSettingsPage,
});

function ModelsSettingsPage() {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "models", locale).map(
			(item) => item.id,
		);
	}, [searchQuery, locale]);

	return <ModelsSettings visibleItems={visibleItems} />;
}
