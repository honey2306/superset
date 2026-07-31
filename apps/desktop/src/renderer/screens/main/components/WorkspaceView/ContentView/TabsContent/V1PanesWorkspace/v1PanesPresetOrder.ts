interface PresetOrderItem {
	id: string;
	pinnedToBar?: boolean;
}

export function getV1PinnedPresetIds(
	matchedPresets: readonly PresetOrderItem[],
): string[] {
	const seenIds = new Set<string>();
	const ids: string[] = [];

	for (const preset of matchedPresets) {
		if (preset.pinnedToBar === false || seenIds.has(preset.id)) {
			continue;
		}
		seenIds.add(preset.id);
		ids.push(preset.id);
	}

	return ids;
}

export function getV1PinnedPresetsForRender<T extends PresetOrderItem>({
	localPinnedPresetIds,
	matchedPresets,
	dragSnapshot,
}: {
	localPinnedPresetIds: readonly string[];
	matchedPresets: readonly T[];
	dragSnapshot: readonly T[] | null;
}): T[] {
	const sourcePresets = dragSnapshot ?? matchedPresets;
	const presetById = new Map(
		sourcePresets.map((preset) => [preset.id, preset]),
	);
	return localPinnedPresetIds.flatMap((id) => {
		const preset = presetById.get(id);
		return preset && preset.pinnedToBar !== false ? [preset] : [];
	});
}

export function syncV1PinnedPresetIds(
	currentIds: readonly string[],
	matchedPresets: readonly PresetOrderItem[],
	isDragging = false,
): string[] {
	if (isDragging) {
		return currentIds as string[];
	}

	const serverIds = getV1PinnedPresetIds(matchedPresets);
	if (
		currentIds.length === serverIds.length &&
		currentIds.every((id, index) => id === serverIds[index])
	) {
		return currentIds as string[];
	}
	return serverIds;
}

export function finishV1PresetDrag({
	localPinnedPresetIds,
	matchedPresets,
	didDrop,
}: {
	localPinnedPresetIds: readonly string[];
	matchedPresets: readonly PresetOrderItem[];
	didDrop: boolean;
}): string[] {
	return didDrop
		? (localPinnedPresetIds as string[])
		: syncV1PinnedPresetIds(localPinnedPresetIds, matchedPresets);
}

export function reorderV1PinnedPresetIds(
	currentIds: readonly string[],
	fromIndex: number,
	toIndex: number,
): string[] {
	if (
		fromIndex < 0 ||
		fromIndex >= currentIds.length ||
		toIndex < 0 ||
		toIndex >= currentIds.length ||
		fromIndex === toIndex
	) {
		return currentIds as string[];
	}

	const nextIds = [...currentIds];
	const [movedId] = nextIds.splice(fromIndex, 1);
	nextIds.splice(toIndex, 0, movedId);
	return nextIds;
}

export function getV1PresetReorderMutation({
	presets,
	currentMatchedPinnedPresetIds,
	pinnedPresetIds,
	originalPinnedPresetIds,
	presetId,
	originalPinnedIndex,
	targetPinnedIndex,
}: {
	presets: readonly PresetOrderItem[];
	currentMatchedPinnedPresetIds?: readonly string[];
	pinnedPresetIds: readonly string[];
	originalPinnedPresetIds: readonly string[];
	presetId: string;
	originalPinnedIndex: number;
	targetPinnedIndex: number;
}): { presetId: string; targetIndex: number } | null {
	if (
		originalPinnedIndex === targetPinnedIndex ||
		originalPinnedPresetIds[originalPinnedIndex] !== presetId ||
		pinnedPresetIds[targetPinnedIndex] !== presetId
	) {
		return null;
	}

	const currentIndex = presets.findIndex((preset) => preset.id === presetId);
	if (currentIndex < 0) {
		return null;
	}

	const originalMemberIds = new Set(originalPinnedPresetIds);
	const currentMemberIds = new Set(
		currentMatchedPinnedPresetIds ?? originalPinnedPresetIds,
	);
	if (
		!currentMemberIds.has(presetId) ||
		pinnedPresetIds.some(
			(id) => originalMemberIds.has(id) && !currentMemberIds.has(id),
		)
	) {
		return null;
	}

	const previousPinnedId = pinnedPresetIds[targetPinnedIndex - 1];
	const nextPinnedId = pinnedPresetIds[targetPinnedIndex + 1];

	if (nextPinnedId) {
		const nextIndex = presets.findIndex((preset) => preset.id === nextPinnedId);
		if (nextIndex < 0) {
			return null;
		}
		return {
			presetId,
			targetIndex: currentIndex < nextIndex ? nextIndex - 1 : nextIndex,
		};
	}

	if (previousPinnedId) {
		const previousIndex = presets.findIndex(
			(preset) => preset.id === previousPinnedId,
		);
		if (previousIndex < 0) {
			return null;
		}
		const adjustedPreviousIndex =
			currentIndex < previousIndex ? previousIndex - 1 : previousIndex;
		return { presetId, targetIndex: adjustedPreviousIndex + 1 };
	}

	return null;
}
