import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import {
	DEFAULT_USER_PREFERENCES,
	USER_PREFERENCES_ID,
	type UserPreferencesRow,
} from "renderer/routes/_local/providers/LocalProductStateProvider/dashboardSidebarLocal/schema";

export type RightSidebarTab = UserPreferencesRow["rightSidebarTab"];

export interface UserPreferencesApi {
	preferences: UserPreferencesRow;
	setRightSidebarTab: (next: RightSidebarTab) => void;
	setRightSidebarWidth: (next: number) => void;
	setDeleteLocalBranch: (next: boolean) => void;
	setShowPresetsBar: (next: boolean | ((prev: boolean) => boolean)) => void;
	toggleShowPresetsBar: () => void;
}

export function useUserPreferences(): UserPreferencesApi {
	const collections = useLocalCollections();

	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ prefs: collections.userPreferences })
				.where(({ prefs }) => eq(prefs.id, USER_PREFERENCES_ID)),
		[collections],
	);

	const preferences = rows[0] ?? DEFAULT_USER_PREFERENCES;

	const setRightSidebarTab = useCallback(
		(next: RightSidebarTab) => {
			const existing = collections.userPreferences.get(USER_PREFERENCES_ID);
			if (!existing) {
				collections.userPreferences.insert({
					...DEFAULT_USER_PREFERENCES,
					rightSidebarTab: next,
				});
				return;
			}
			collections.userPreferences.update(USER_PREFERENCES_ID, (draft) => {
				draft.rightSidebarTab = next;
			});
		},
		[collections],
	);

	const setRightSidebarWidth = useCallback(
		(next: number) => {
			const existing = collections.userPreferences.get(USER_PREFERENCES_ID);
			if (!existing) {
				collections.userPreferences.insert({
					...DEFAULT_USER_PREFERENCES,
					rightSidebarWidth: next,
				});
				return;
			}
			collections.userPreferences.update(USER_PREFERENCES_ID, (draft) => {
				draft.rightSidebarWidth = next;
			});
		},
		[collections],
	);

	const setDeleteLocalBranch = useCallback(
		(next: boolean) => {
			const existing = collections.userPreferences.get(USER_PREFERENCES_ID);
			if (!existing) {
				collections.userPreferences.insert({
					...DEFAULT_USER_PREFERENCES,
					deleteLocalBranch: next,
				});
				return;
			}
			collections.userPreferences.update(USER_PREFERENCES_ID, (draft) => {
				draft.deleteLocalBranch = next;
			});
		},
		[collections],
	);

	const setShowPresetsBar = useCallback(
		(next: boolean | ((prev: boolean) => boolean)) => {
			const existing = collections.userPreferences.get(USER_PREFERENCES_ID);
			const prev =
				existing?.showPresetsBar ?? DEFAULT_USER_PREFERENCES.showPresetsBar;
			const value = typeof next === "function" ? next(prev) : next;
			if (!existing) {
				collections.userPreferences.insert({
					...DEFAULT_USER_PREFERENCES,
					showPresetsBar: value,
				});
				return;
			}
			collections.userPreferences.update(USER_PREFERENCES_ID, (draft) => {
				draft.showPresetsBar = value;
			});
		},
		[collections],
	);

	// Functional update reads the collection at write time, so back-to-back
	// toggles can't act on a stale snapshot.
	const toggleShowPresetsBar = useCallback(() => {
		setShowPresetsBar((prev) => !prev);
	}, [setShowPresetsBar]);

	return {
		preferences,
		setRightSidebarTab,
		setRightSidebarWidth,
		setDeleteLocalBranch,
		setShowPresetsBar,
		toggleShowPresetsBar,
	};
}
