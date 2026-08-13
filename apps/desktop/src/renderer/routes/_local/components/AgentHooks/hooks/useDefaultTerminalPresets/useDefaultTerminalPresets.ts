import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect } from "react";
import { useAgentConfigs } from "renderer/hooks/useAgentConfigs";
import {
	DEFAULT_USER_PREFERENCES,
	USER_PREFERENCES_ID,
} from "renderer/routes/_local/providers/LocalProductStateProvider/dashboardSidebarLocal/schema";
import { useLocalCollections } from "../../../../providers/LocalProductStateProvider";
import { createDefaultTerminalPresetRows } from "./default-terminal-presets";

export function useDefaultTerminalPresets(hostUrl: string | null): void {
	const collections = useLocalCollections();
	const { data: agents = [], isFetched: agentsFetched } =
		useAgentConfigs(hostUrl);

	const { data: presets = [], isReady: presetsReady } = useLiveQuery(
		(query) => query.from({ presets: collections.terminalPresets }),
		[collections],
	);
	const { data: preferenceRows = [], isReady: preferencesReady } = useLiveQuery(
		(query) =>
			query
				.from({ prefs: collections.userPreferences })
				.where(({ prefs }) => eq(prefs.id, USER_PREFERENCES_ID)),
		[collections],
	);

	const preferences = preferenceRows[0] ?? DEFAULT_USER_PREFERENCES;

	useEffect(() => {
		if (
			!hostUrl ||
			!agentsFetched ||
			!presetsReady ||
			!preferencesReady ||
			preferences.terminalPresetsInitialized
		) {
			return;
		}

		const createdAt = new Date();
		const rows = createDefaultTerminalPresetRows({
			agents,
			existingPresets: presets,
			createId: () => crypto.randomUUID(),
			createdAt,
		});

		for (const row of rows) {
			collections.terminalPresets.insert(row);
		}

		// If both are empty, agents weren't available yet — retry next launch.
		if (rows.length === 0 && presets.length === 0) return;

		const existingPreferences =
			collections.userPreferences.get(USER_PREFERENCES_ID);
		if (!existingPreferences) {
			collections.userPreferences.insert({
				...DEFAULT_USER_PREFERENCES,
				terminalPresetsInitialized: true,
			});
			return;
		}

		collections.userPreferences.update(USER_PREFERENCES_ID, (draft) => {
			draft.terminalPresetsInitialized = true;
		});
	}, [
		agents,
		agentsFetched,
		collections.terminalPresets,
		collections.userPreferences,
		hostUrl,
		preferences.terminalPresetsInitialized,
		preferencesReady,
		presetsReady,
		presets,
	]);
}
