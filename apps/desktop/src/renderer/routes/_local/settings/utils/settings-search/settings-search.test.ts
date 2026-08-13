import { describe, expect, it } from "bun:test";
import {
	SETTING_ITEM_ID,
	type SettingsItem,
	searchSettings,
} from "./settings-search";

const REMOVED_SECTIONS = [
	"account",
	"integrations",
	"apikeys",
	"hosts",
	"security",
	"experimental",
	"links",
] as const;

const REMOVED_ROUTES = [
	"/settings/account",
	"/settings/integrations",
	"/settings/api-keys",
	"/settings/hosts",
	"/settings/security",
	"/settings/experimental",
	"/settings/links",
] as const;

const RETAINED_ROUTES = [
	"/settings/appearance",
	"/settings/ringtones",
	"/settings/behavior",
	"/settings/keyboard",
	"/settings/git",
	"/settings/terminal",
	"/settings/models",
	"/settings/projects",
	"/settings/presets",
	"/settings/permissions",
] as const;

const RETAINED_SEARCH_ITEMS = [
	SETTING_ITEM_ID.APPEARANCE_THEME,
	SETTING_ITEM_ID.RINGTONES_NOTIFICATION,
	SETTING_ITEM_ID.BEHAVIOR_CONFIRM_QUIT,
	SETTING_ITEM_ID.KEYBOARD_SHORTCUTS,
	SETTING_ITEM_ID.GIT_BRANCH_PREFIX,
	SETTING_ITEM_ID.TERMINAL_PRESETS,
	SETTING_ITEM_ID.MODELS_ANTHROPIC,
	SETTING_ITEM_ID.PROJECT_NAME,
	SETTING_ITEM_ID.PERMISSIONS_FULL_DISK_ACCESS,
] as const;

const LEGACY_ROUTE_SCAN_EXCLUSIONS = new Set([
	"routeTree.gen.ts",
	"routes/_local/settings/utils/settings-search/settings-search.test.ts",
	"routes/_local/settings/utils/settings-search/settings-search.ts",
]);

async function getRemovedRouteLiteralOccurrences(): Promise<string[]> {
	const rendererDirectory = `${import.meta.dir}/../../../../../`;
	const sourceFiles = new Bun.Glob("**/*.{ts,tsx}");
	const occurrences: string[] = [];

	for await (const relativePath of sourceFiles.scan({
		cwd: rendererDirectory,
	})) {
		if (LEGACY_ROUTE_SCAN_EXCLUSIONS.has(relativePath)) continue;
		const contents = await Bun.file(
			`${rendererDirectory}/${relativePath}`,
		).text();
		for (const route of REMOVED_ROUTES) {
			if (contents.includes(`"${route}`)) {
				occurrences.push(`${relativePath}: ${route}`);
			}
		}
	}

	return occurrences;
}

function getIds(items: SettingsItem[]): string[] {
	return items.map((item) => item.id);
}

describe("settings search - font settings", () => {
	it('searching "font" returns both APPEARANCE_EDITOR_FONT and APPEARANCE_TERMINAL_FONT', () => {
		const results = searchSettings("font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "terminal font" returns APPEARANCE_TERMINAL_FONT', () => {
		const results = searchSettings("terminal font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "editor" returns APPEARANCE_EDITOR_FONT', () => {
		const results = searchSettings("editor");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
	});

	it('searching "monospace" returns both font items', () => {
		const results = searchSettings("monospace");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it('searching "Editor Font" is case-insensitive', () => {
		const results = searchSettings("Editor Font");
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
	});

	it("empty search returns all settings items", () => {
		const results = searchSettings("");
		expect(results.length).toBeGreaterThan(0);
		const ids = getIds(results);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
	});

	it("font items have correct section", () => {
		const results = searchSettings("font");
		const editorFont = results.find(
			(r) => r.id === SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT,
		);
		const terminalFont = results.find(
			(r) => r.id === SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT,
		);

		expect(editorFont?.section).toBe("appearance");
		expect(terminalFont?.section).toBe("appearance");
	});
});

describe("settings navigation exposure", () => {
	it("does not register removed routes and keeps retained route files", async () => {
		for (const route of REMOVED_ROUTES) {
			const routePath = route.replace("/settings/", "");
			expect(
				await Bun.file(
					`${import.meta.dir}/../../${routePath}/page.tsx`,
				).exists(),
			).toBe(false);
		}
		for (const route of RETAINED_ROUTES) {
			const routePath = route.replace("/settings/", "");
			expect(
				await Bun.file(
					`${import.meta.dir}/../../${routePath}/page.tsx`,
				).exists(),
			).toBe(true);
		}
	});

	it("does not expose removed routes in settings navigation indexes", async () => {
		const navigationSources = [
			`${import.meta.dir}/../../components/SettingsSidebar/GeneralSettings.tsx`,
			`${import.meta.dir}/../../../../../commandPalette/modules/settings/commands.ts`,
		];

		for (const source of navigationSources) {
			const contents = await Bun.file(source).text();
			for (const route of REMOVED_ROUTES) {
				expect(contents).not.toContain(`path: "${route}"`);
				expect(contents).not.toContain(`id: "${route}"`);
			}
		}

		const settingsCommands = await Bun.file(navigationSources[1]).text();
		for (const route of RETAINED_ROUTES) {
			expect(settingsCommands).toContain(route);
		}
	});

	it("removes obsolete V2 and Linear settings CTAs", async () => {
		const obsoleteCtas = [
			`${import.meta.dir}/../../../../../components/V2AvailableBanner/V2AvailableBanner.tsx`,
			`${import.meta.dir}/../../../../_dashboard/tasks/components/TasksView/components/LinearCTA/LinearCTA.tsx`,
		];

		for (const source of obsoleteCtas) {
			expect(await Bun.file(source).exists()).toBe(false);
		}
	});

	it("does not contain removed route literals anywhere in renderer source", async () => {
		expect(await getRemovedRouteLiteralOccurrences()).toEqual([]);
	});
});

describe("settings search exposure", () => {
	it("omits removed sections while retaining supported settings", () => {
		const results = searchSettings("");

		const ids = getIds(results);
		for (const section of REMOVED_SECTIONS) {
			expect(results.some((item) => (item.section as string) === section)).toBe(
				false,
			);
		}
		for (const itemId of RETAINED_SEARCH_ITEMS) {
			expect(ids).toContain(itemId);
		}
	});
});

describe("settings search - localization", () => {
	it("uses localized titles and finds Chinese keywords", () => {
		const results = searchSettings("字体", "zh-CN");
		const ids = getIds(results);

		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT);
		expect(ids).toContain(SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT);
		expect(
			results.find((item) => item.id === SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT)
				?.title,
		).toBe("编辑器字体");
	});
});
