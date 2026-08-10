type ThemeType = "dark" | "light";

function isThemeType(value: string | null): value is ThemeType {
	return value === "dark" || value === "light";
}

export function resolveTerminalThemeType(params?: {
	activeThemeType?: ThemeType;
	storage?: Pick<Storage, "getItem">;
}): ThemeType {
	const activeThemeType = params?.activeThemeType;
	if (activeThemeType) {
		return activeThemeType;
	}

	try {
		const storage = params?.storage ?? localStorage;
		const persistedThemeType = storage.getItem("theme-type");
		if (isThemeType(persistedThemeType)) {
			return persistedThemeType;
		}
	} catch {
		// localStorage unavailable in some contexts
	}

	return "dark";
}
