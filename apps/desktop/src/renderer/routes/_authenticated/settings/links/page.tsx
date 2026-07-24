import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { LinksSettings } from "./components/LinksSettings";

export const Route = createFileRoute("/_authenticated/settings/links/")({
	component: LinksSettingsPage,
});

function LinksSettingsPage() {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();
	const isV2CloudEnabled = useIsV2CloudEnabled();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "links",
				searchQuery,
				isV2: isV2CloudEnabled,
				locale,
			}),
		[searchQuery, isV2CloudEnabled, locale],
	);

	return <LinksSettings visibleItems={visibleItems} />;
}
