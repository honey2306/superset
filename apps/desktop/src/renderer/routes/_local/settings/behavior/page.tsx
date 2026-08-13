import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { BehaviorSettings } from "./components/BehaviorSettings";

export const Route = createFileRoute("/_local/settings/behavior/")({
	component: BehaviorSettingsPage,
});

function BehaviorSettingsPage() {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "behavior",
				searchQuery,
				locale,
			}),
		[searchQuery, locale],
	);

	return <BehaviorSettings visibleItems={visibleItems} />;
}
