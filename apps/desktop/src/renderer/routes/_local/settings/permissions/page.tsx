import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search/settings-search";
import { PermissionsSettings } from "./components/PermissionsSettings";

export const Route = createFileRoute("/_local/settings/permissions/")({
	component: PermissionsSettingsPage,
});

function PermissionsSettingsPage() {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "permissions", locale).map(
			(item) => item.id,
		);
	}, [searchQuery, locale]);

	return <PermissionsSettings visibleItems={visibleItems} />;
}
