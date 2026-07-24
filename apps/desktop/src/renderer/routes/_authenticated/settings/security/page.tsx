import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { SecuritySettings } from "./components/SecuritySettings";

export const Route = createFileRoute("/_authenticated/settings/security/")({
	component: SecuritySettingsPage,
});

function SecuritySettingsPage() {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "security", locale).map(
			(item) => item.id,
		);
	}, [searchQuery, locale]);

	return <SecuritySettings visibleItems={visibleItems} />;
}
