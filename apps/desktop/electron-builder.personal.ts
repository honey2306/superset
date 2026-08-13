/**
 * Electron Builder Configuration - Personal Build
 *
 * A self-managed artifact with isolated local state and no official updater.
 */

import type { Configuration } from "electron-builder";
import baseConfig from "./electron-builder";

const productName = "Superset Personal";

const config: Configuration = {
	...baseConfig,
	appId: "com.superset.desktop.personal",
	productName,
	// app.getName() reads packaged metadata, which drives runtime data isolation.
	extraMetadata: { productName },
	// Personal builds are self-managed; never publish to Superset's release feed.
	publish: null,
	protocols: [
		{
			name: productName,
			schemes: ["superset-personal"],
		},
	],

	mac: {
		...baseConfig.mac,
		artifactName: `Superset-Personal-\${version}-\${arch}.\${ext}`,
		extendInfo: {
			...baseConfig.mac?.extendInfo,
			CFBundleName: productName,
			CFBundleDisplayName: productName,
		},
	},

	linux: {
		...baseConfig.linux,
		artifactName: `superset-personal-\${version}-\${arch}.\${ext}`,
	},

	win: {
		...baseConfig.win,
		artifactName: `Superset-Personal-\${version}-\${arch}.\${ext}`,
	},
};

export default config;
