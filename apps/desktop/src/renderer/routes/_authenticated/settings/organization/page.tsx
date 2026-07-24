import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { OrganizationSettings } from "./components/OrganizationSettings";

export const Route = createFileRoute("/_authenticated/settings/organization/")({
	component: OrganizationSettingsPage,
});

function OrganizationSettingsPage() {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "organization", locale).map(
			(item) => item.id,
		);
	}, [searchQuery, locale]);

	return <OrganizationSettings visibleItems={visibleItems} />;
}
