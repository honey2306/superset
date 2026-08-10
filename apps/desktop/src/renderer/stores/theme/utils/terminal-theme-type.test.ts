import { beforeEach, describe, expect, it } from "bun:test";
import { resolveTerminalThemeType } from "./terminal-theme-type";

// Mock localStorage for Node.js test environment
const mockStorage = new Map<string, string>();
const mockLocalStorage = {
	getItem: (key: string) => mockStorage.get(key) ?? null,
	setItem: (key: string, value: string) => mockStorage.set(key, value),
	removeItem: (key: string) => mockStorage.delete(key),
	clear: () => mockStorage.clear(),
};

describe("resolveTerminalThemeType", () => {
	beforeEach(() => {
		mockStorage.clear();
	});

	it("prefers active theme type when provided", () => {
		mockLocalStorage.setItem("theme-type", "dark");
		const result = resolveTerminalThemeType({
			activeThemeType: "light",
			storage: mockLocalStorage,
		});
		expect(result).toBe("light");
	});

	it("falls back to persisted theme-type when active theme is unavailable", () => {
		mockLocalStorage.setItem("theme-type", "light");
		const result = resolveTerminalThemeType({ storage: mockLocalStorage });
		expect(result).toBe("light");
	});

	it("falls back to dark when persisted theme-type is invalid", () => {
		mockLocalStorage.setItem("theme-type", "invalid");
		const result = resolveTerminalThemeType({ storage: mockLocalStorage });
		expect(result).toBe("dark");
	});

	it("falls back to dark when localStorage is empty", () => {
		const result = resolveTerminalThemeType({ storage: mockLocalStorage });
		expect(result).toBe("dark");
	});
});
