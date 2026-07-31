import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	DEFAULT_V2_USER_PREFERENCES,
	V2_USER_PREFERENCES_ID,
	type V2UserPreferencesRow,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";

export type RightSidebarTab = V2UserPreferencesRow["rightSidebarTab"];

export interface V2UserPreferencesApi {
	preferences: V2UserPreferencesRow;
	setRightSidebarOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
	setRightSidebarTab: (next: RightSidebarTab) => void;
	setRightSidebarWidth: (next: number) => void;
	setDeleteLocalBranch: (next: boolean) => void;
	setShowPresetsBar: (next: boolean | ((prev: boolean) => boolean)) => void;
	toggleShowPresetsBar: () => void;
}

export function useV2UserPreferences(): V2UserPreferencesApi {
	const collections = useCollections();

	const { data: rows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ prefs: collections.v2UserPreferences })
				.where(({ prefs }) => eq(prefs.id, V2_USER_PREFERENCES_ID)),
		[collections],
	);

	const preferences = rows[0] ?? DEFAULT_V2_USER_PREFERENCES;

	const setRightSidebarOpen = useCallback(
		(next: boolean | ((prev: boolean) => boolean)) => {
			const existing = collections.v2UserPreferences.get(
				V2_USER_PREFERENCES_ID,
			);
			const prev =
				existing?.rightSidebarOpen ??
				DEFAULT_V2_USER_PREFERENCES.rightSidebarOpen;
			const value = typeof next === "function" ? next(prev) : next;
			if (!existing) {
				collections.v2UserPreferences.insert({
					...DEFAULT_V2_USER_PREFERENCES,
					rightSidebarOpen: value,
				});
				return;
			}
			collections.v2UserPreferences.update(V2_USER_PREFERENCES_ID, (draft) => {
				draft.rightSidebarOpen = value;
			});
		},
		[collections],
	);

	const setRightSidebarTab = useCallback(
		(next: RightSidebarTab) => {
			const existing = collections.v2UserPreferences.get(
				V2_USER_PREFERENCES_ID,
			);
			if (!existing) {
				collections.v2UserPreferences.insert({
					...DEFAULT_V2_USER_PREFERENCES,
					rightSidebarTab: next,
				});
				return;
			}
			collections.v2UserPreferences.update(V2_USER_PREFERENCES_ID, (draft) => {
				draft.rightSidebarTab = next;
			});
		},
		[collections],
	);

	const setRightSidebarWidth = useCallback(
		(next: number) => {
			const existing = collections.v2UserPreferences.get(
				V2_USER_PREFERENCES_ID,
			);
			if (!existing) {
				collections.v2UserPreferences.insert({
					...DEFAULT_V2_USER_PREFERENCES,
					rightSidebarWidth: next,
				});
				return;
			}
			collections.v2UserPreferences.update(V2_USER_PREFERENCES_ID, (draft) => {
				draft.rightSidebarWidth = next;
			});
		},
		[collections],
	);

	const setDeleteLocalBranch = useCallback(
		(next: boolean) => {
			const existing = collections.v2UserPreferences.get(
				V2_USER_PREFERENCES_ID,
			);
			if (!existing) {
				collections.v2UserPreferences.insert({
					...DEFAULT_V2_USER_PREFERENCES,
					deleteLocalBranch: next,
				});
				return;
			}
			collections.v2UserPreferences.update(V2_USER_PREFERENCES_ID, (draft) => {
				draft.deleteLocalBranch = next;
			});
		},
		[collections],
	);

	const setShowPresetsBar = useCallback(
		(next: boolean | ((prev: boolean) => boolean)) => {
			const existing = collections.v2UserPreferences.get(
				V2_USER_PREFERENCES_ID,
			);
			const prev =
				existing?.showPresetsBar ?? DEFAULT_V2_USER_PREFERENCES.showPresetsBar;
			const value = typeof next === "function" ? next(prev) : next;
			if (!existing) {
				collections.v2UserPreferences.insert({
					...DEFAULT_V2_USER_PREFERENCES,
					showPresetsBar: value,
				});
				return;
			}
			collections.v2UserPreferences.update(V2_USER_PREFERENCES_ID, (draft) => {
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
		setRightSidebarOpen,
		setRightSidebarTab,
		setRightSidebarWidth,
		setDeleteLocalBranch,
		setShowPresetsBar,
		toggleShowPresetsBar,
	};
}
