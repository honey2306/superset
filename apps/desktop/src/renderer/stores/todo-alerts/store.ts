import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * Renderer-local watermark of the newest todo alert the user has seen,
 * so opening the Todos page clears the sidebar badge until a newer alert
 * arrives. The alert count itself is DERIVED from todo rows (see
 * `useTodoAlerts`); the only fact stored here is the user's seen mark.
 */
export interface TodoAlertsState {
	/**
	 * updatedAt (ms) of the newest alerting todo the user has acknowledged.
	 * This is the DB timestamp (a single server clock), so it's comparable
	 * across hosts without skew — never substitute the renderer clock here.
	 */
	lastSeenAlertAt: number;
	/** Acknowledge alerts up to `at`. Monotonic — never moves backward. */
	markAlertsSeen: (at: number) => void;
}

export const useTodoAlertsStore = create<TodoAlertsState>()(
	devtools(
		persist(
			(set) => ({
				lastSeenAlertAt: 0,
				markAlertsSeen: (at) => {
					set((state) =>
						at > state.lastSeenAlertAt ? { lastSeenAlertAt: at } : state,
					);
				},
			}),
			{
				// Compatibility: retain the historical storage key across upgrades.
				name: "todo-alerts-v1",
				version: 1,
				partialize: (state) => ({ lastSeenAlertAt: state.lastSeenAlertAt }),
			},
		),
		{ name: "TodoAlerts" },
	),
);
