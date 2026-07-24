import { useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import { getMatchingItemsForSection } from "../../../utils/settings-search";
import { AgentsSettings } from "../AgentsSettings";

interface AgentsSettingsPageProps {
	initialAgentId?: string | null;
}

export function AgentsSettingsPage({
	initialAgentId = null,
}: AgentsSettingsPageProps) {
	const { locale } = useTranslation();
	const searchQuery = useSettingsSearchQuery();

	const visibleItems = useMemo(() => {
		if (!searchQuery) return null;
		return getMatchingItemsForSection(searchQuery, "agents", locale).map(
			(item) => item.id,
		);
	}, [searchQuery, locale]);

	return (
		<AgentsSettings
			visibleItems={visibleItems}
			initialAgentId={initialAgentId}
		/>
	);
}
