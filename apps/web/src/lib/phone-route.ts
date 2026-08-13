const resumeHashPattern = /^#(\/r\/[A-Za-z0-9_-]+)(?:\/.*)?$/;

/** Keeps AutoMate navigation under its fragment-only resume route. */
export function getPhoneRoute(path: string, hash = location.hash): string {
	const prefix = resumeHashPattern.exec(hash)?.[1];
	if (!prefix || !path.startsWith("/")) return path;
	return path === "/" ? prefix : `${prefix}${path}`;
}
