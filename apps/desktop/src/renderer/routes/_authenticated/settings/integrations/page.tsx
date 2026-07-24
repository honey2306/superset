import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { IntegrationsSettings } from "./components/IntegrationsSettings";

export const Route = createFileRoute("/_authenticated/settings/integrations/")({
	component: IntegrationsSettingsPage,
});

function IntegrationsSettingsPage() {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "integrations", locale).map(
			(item) => item.id,
		);
	}, [searchQuery, locale]);

	return <IntegrationsSettings visibleItems={visibleItems} />;
}
