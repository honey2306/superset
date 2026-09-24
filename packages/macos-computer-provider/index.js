let native;
try {
	native = require("./build/Release/macos_computer_provider.node");
} catch {
	native = null;
}

function unavailable() {
	throw new Error(
		"Superset macOS Computer Provider is unavailable on this host",
	);
}

function call(name, ...args) {
	if (!native || typeof native[name] !== "function") {
		return unavailable();
	}
	return native[name](...args);
}

module.exports = {
	isAvailable: () => Boolean(native),
	listSpaces: () => call("listSpaces"),
	spacesForWindow: (windowId) => call("spacesForWindow", windowId),
	switchSpace: (spaceId) => call("switchSpace", spaceId),
	moveWindowToSpace: (windowId, spaceId) =>
		call("moveWindowToSpace", windowId, spaceId),
	windowAction: (pid, windowId, action) =>
		call("windowAction", pid, windowId, action),
	appAction: (pid, action) => call("appAction", pid, action),
	listDockItems: (includeAll = false) => call("listDockItems", includeAll),
	dockAction: (name, action, menuItem) =>
		call("dockAction", name, action, menuItem),
	isDockHidden: () => call("isDockHidden"),
	setDockHidden: (hidden) => call("setDockHidden", hidden),
	saveClipboard: () => call("saveClipboard"),
	restoreClipboard: (token) => call("restoreClipboard", token),
};
