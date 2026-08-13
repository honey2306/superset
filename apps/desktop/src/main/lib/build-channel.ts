import { app } from "electron";
import { prerelease } from "semver";
import { CANARY_PRODUCT_NAME, PERSONAL_PRODUCT_NAME } from "shared/constants";

/**
 * True for prerelease builds like "0.0.53-canary" (same detection as the
 * auto-updater's channel pick). Stable versions have no prerelease component.
 */
export function isPrereleaseBuild(): boolean {
	const prereleaseComponents = prerelease(app.getVersion());
	return prereleaseComponents !== null && prereleaseComponents.length > 0;
}

export function isPersonalBuild(): boolean {
	return (
		process.env.SUPERSET_BUILD_CHANNEL === "personal" ||
		app.getName() === PERSONAL_PRODUCT_NAME
	);
}

/**
 * Canary artifacts can carry a stable-looking version while still needing the
 * canary updater feed. The product name is set by electron-builder.canary.ts.
 */
export function isCanaryBuild(): boolean {
	return (
		!isPersonalBuild() &&
		(process.env.SUPERSET_BUILD_CHANNEL === "canary" ||
			app.getName() === CANARY_PRODUCT_NAME ||
			isPrereleaseBuild())
	);
}

/** Personal artifacts are user-managed and must never query Superset's feeds. */
export function shouldUseOfficialAutoUpdater(): boolean {
	return !isPersonalBuild();
}

/**
 * True on builds that ship to the team, not the public: canary releases and
 * unpackaged dev runs (`bun dev` carries a stable-looking version). Gates
 * pre-release features without a user-facing setting.
 */
export function isInternalBuild(): boolean {
	return isCanaryBuild() || !app.isPackaged;
}
