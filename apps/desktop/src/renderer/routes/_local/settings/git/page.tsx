import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getVisibleItemsForSection } from "../utils/settings-search";
import { GitSettings } from "./components/GitSettings";

export const Route = createFileRoute("/_local/settings/git/")({
	component: GitSettingsPage,
	validateSearch: (search: Record<string, unknown>): { hostId?: string } => ({
		hostId: typeof search.hostId === "string" ? search.hostId : undefined,
	}),
});

function GitSettingsPage() {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(
		() =>
			getVisibleItemsForSection({
				section: "git",
				searchQuery,
				locale,
			}),
		[searchQuery, locale],
	);

	return <GitSettings visibleItems={visibleItems} />;
}
