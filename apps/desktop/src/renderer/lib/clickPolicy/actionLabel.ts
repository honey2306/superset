import type { LinkAction, Surface, Translator } from "./types";

function fileLabel(action: LinkAction, t: Translator): string {
	switch (action) {
		case "pane":
			return t("clickPolicy.openInTab");
		case "newTab":
			return t("clickPolicy.openInNewTab");
		case "external":
			return t("clickPolicy.openInEditor");
	}
}

function urlLabel(action: LinkAction, t: Translator): string {
	switch (action) {
		case "pane":
			return t("clickPolicy.openInInAppBrowser");
		case "newTab":
			return t("clickPolicy.openInNewBrowserTab");
		case "external":
			return t("clickPolicy.openInDefaultBrowser");
	}
}

export function actionLabel(
	action: LinkAction,
	surface: Surface,
	t: Translator,
): string {
	return surface === "file" ? fileLabel(action, t) : urlLabel(action, t);
}

export function actionLabelOrNone(
	action: LinkAction | null,
	surface: Surface,
	t: Translator,
): string {
	return action === null
		? t("clickPolicy.doNothing")
		: actionLabel(action, surface, t);
}

/** Short verb form used inside the per-row hint tooltip. */
function shortFileLabel(action: LinkAction, t: Translator): string {
	switch (action) {
		case "pane":
			return t("clickPolicy.short.open");
		case "newTab":
			return t("clickPolicy.short.newTab");
		case "external":
			return t("clickPolicy.short.editor");
	}
}

function shortUrlLabel(action: LinkAction, t: Translator): string {
	switch (action) {
		case "pane":
			return t("clickPolicy.short.inAppBrowser");
		case "newTab":
			return t("clickPolicy.short.newTab");
		case "external":
			return t("clickPolicy.short.defaultBrowser");
	}
}

export function shortActionLabel(
	action: LinkAction,
	surface: Surface,
	t: Translator,
): string {
	return surface === "file"
		? shortFileLabel(action, t)
		: shortUrlLabel(action, t);
}
