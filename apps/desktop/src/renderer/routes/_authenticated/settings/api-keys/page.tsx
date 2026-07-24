import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { ApiKeysSettings } from "./components/ApiKeysSettings";

export const Route = createFileRoute("/_authenticated/settings/api-keys/")({
	component: ApiKeysSettingsPage,
});

function ApiKeysSettingsPage() {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "apikeys", locale).map(
			(item) => item.id,
		);
	}, [searchQuery, locale]);

	return <ApiKeysSettings visibleItems={visibleItems} />;
}
