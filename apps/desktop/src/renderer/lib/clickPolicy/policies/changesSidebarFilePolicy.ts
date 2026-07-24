import { modifierLabel } from "../modifierLabel";
import { tierFor } from "../tiers";
import type {
	LinkAction,
	LinkTier,
	LinkTierMap,
	ModifierEvent,
	Translator,
} from "../types";

export type ChangesSidebarFileIntent =
	| "diff"
	| "diffNewTab"
	| "file"
	| "external";

const MODIFIER_TIERS: LinkTier[] = ["shift", "meta", "metaShift"];

function intentFor(
	tier: LinkTier,
	action: LinkAction | null,
): ChangesSidebarFileIntent | null {
	if (action === null) return null;
	if (action === "external") return "external";
	if (action === "newTab") return "diffNewTab";
	return tier === "plain" ? "diff" : "file";
}

function shortIntentLabel(
	intent: ChangesSidebarFileIntent,
	t: Translator,
): string {
	if (intent === "diff") return t("clickPolicy.short.diff");
	if (intent === "diffNewTab") return t("clickPolicy.short.diffNewTab");
	if (intent === "file") return t("clickPolicy.short.openFile");
	return t("clickPolicy.short.editor");
}

export function resolveChangesSidebarFileIntent(
	map: LinkTierMap,
	event: ModifierEvent,
): ChangesSidebarFileIntent | null {
	const tier = tierFor(event, "4-tier");
	return intentFor(tier, map[tier]);
}

export function tierForChangesSidebarFileIntent(
	map: LinkTierMap,
	intent: ChangesSidebarFileIntent,
): LinkTier | null {
	for (const tier of MODIFIER_TIERS) {
		if (intentFor(tier, map[tier]) === intent) return tier;
	}
	return null;
}

export function buildChangesSidebarFileHint(
	map: LinkTierMap,
	t: Translator,
): string {
	return MODIFIER_TIERS.flatMap((tier) => {
		const intent = intentFor(tier, map[tier]);
		if (intent === null) return [];
		return `${modifierLabel(tier, t)}: ${shortIntentLabel(intent, t)}`;
	}).join(" · ");
}
