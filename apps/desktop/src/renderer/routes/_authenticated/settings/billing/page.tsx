import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../utils/settings-search";
import { BillingOverview } from "./components/BillingOverview";

export const Route = createFileRoute("/_authenticated/settings/billing/")({
	component: BillingPage,
});

function BillingPage() {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "billing", locale).map(
			(item) => item.id,
		);
	}, [searchQuery, locale]);

	return <BillingOverview visibleItems={visibleItems} />;
}
