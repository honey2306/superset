import type { LinkTier, Translator } from "./types";

const isMac =
	typeof navigator !== "undefined" &&
	navigator.platform.toLowerCase().includes("mac");

export function modifierLabel(tier: LinkTier, t: Translator): string {
	const click = t("clickPolicy.modifier.click");
	if (tier === "plain") return click;
	if (isMac) {
		switch (tier) {
			case "shift":
				return `⇧ ${click}`;
			case "meta":
				return `⌘ ${click}`;
			case "metaShift":
				return `⌘⇧ ${click}`;
		}
	}
	switch (tier) {
		case "shift":
			return `Shift+${click}`;
		case "meta":
			return `Ctrl+${click}`;
		case "metaShift":
			return `Ctrl+Shift+${click}`;
	}
}
