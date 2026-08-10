export type TodoContentState = "loading" | "empty" | "todos";

/**
 * Cached collection rows are valid before the live query is fully ready.
 * Only an empty, ready collection is a genuine empty state.
 */
export function getTodoContentState(
	rowCount: number,
	isReady: boolean,
): TodoContentState {
	if (rowCount > 0) return "todos";
	return isReady ? "empty" : "loading";
}
