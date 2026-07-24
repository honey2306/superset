import { COMPANY } from "@superset/shared/constants";
import { Button } from "@superset/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { type ChangeEvent, useRef, useState } from "react";
import {
	HiOutlineArrowDownTray,
	HiOutlineArrowTopRightOnSquare,
	HiOutlineArrowUpTray,
} from "react-icons/hi2";
import { ThemeSwatch } from "renderer/components/ThemeSwatch";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	SYSTEM_THEME_ID,
	useSetSystemThemePreference,
	useSetTheme,
	useSystemDarkThemeId,
	useSystemLightThemeId,
	useThemeId,
	useThemeStore,
} from "renderer/stores";
import {
	builtInThemes,
	darkTheme as defaultDarkTheme,
	lightTheme as defaultLightTheme,
	getTerminalColors,
	parseThemeConfigFile,
	type Theme,
} from "shared/themes";

const MAX_THEME_FILE_SIZE = 256 * 1024; // 256 KB

function ThemeOptionRow({ theme }: { theme: Theme }) {
	return (
		<div className="flex items-center gap-2 min-w-0">
			<ThemeSwatch theme={theme} />
			<span className="truncate">{theme.name}</span>
		</div>
	);
}

interface ThemeRowProps {
	label: string;
	hint: React.ReactNode;
	value: string;
	onValueChange: (value: string) => void;
	currentTheme: Theme;
	options: ReadonlyArray<{ group: string; themes: Theme[] }>;
	includeSystem?: {
		darkTheme: Theme;
		lightTheme: Theme;
	};
}

function ThemeRow({
	label,
	hint,
	value,
	onValueChange,
	currentTheme,
	options,
	includeSystem,
}: ThemeRowProps) {
	const { t } = useTranslation();
	const isSystem = includeSystem !== undefined && value === SYSTEM_THEME_ID;
	return (
		<div className="flex items-center justify-between gap-6 p-4">
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{label}</div>
				<div className="text-xs text-muted-foreground">{hint}</div>
			</div>
			<Select value={value} onValueChange={onValueChange}>
				<SelectTrigger size="sm" className="w-auto min-w-44 px-2">
					<SelectValue>
						{isSystem ? (
							<div className="flex items-center gap-2 min-w-0">
								<div className="flex shrink-0 -space-x-1">
									<ThemeSwatch theme={includeSystem.lightTheme} />
									<ThemeSwatch theme={includeSystem.darkTheme} />
								</div>
								<span className="truncate text-xs">
									{t("appearance.system")}
								</span>
							</div>
						) : (
							<div className="flex items-center gap-2 min-w-0">
								<ThemeSwatch theme={currentTheme} />
								<span className="truncate text-xs">{currentTheme.name}</span>
							</div>
						)}
					</SelectValue>
				</SelectTrigger>
				<SelectContent className="max-h-[320px]">
					{includeSystem && (
						<>
							<SelectItem value={SYSTEM_THEME_ID}>
								<div className="flex items-center gap-2 min-w-0">
									<div className="flex shrink-0 -space-x-1">
										<ThemeSwatch theme={includeSystem.lightTheme} />
										<ThemeSwatch theme={includeSystem.darkTheme} />
									</div>
									<span className="truncate">{t("appearance.system")}</span>
								</div>
							</SelectItem>
							<SelectSeparator />
						</>
					)}
					{options.map((group, idx) => (
						<SelectGroup key={group.group}>
							{idx > 0 && <SelectSeparator />}
							<SelectLabel className="text-xs text-muted-foreground">
								{group.group}
							</SelectLabel>
							{group.themes.map((theme) => (
								<SelectItem key={theme.id} value={theme.id}>
									<ThemeOptionRow theme={theme} />
								</SelectItem>
							))}
						</SelectGroup>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export function ThemeSection() {
	const { t } = useTranslation();
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isImporting, setIsImporting] = useState(false);
	const activeThemeId = useThemeId();
	const setTheme = useSetTheme();
	const activeTheme = useThemeStore((state) => state.activeTheme);
	const customThemes = useThemeStore((state) => state.customThemes);
	const upsertCustomThemes = useThemeStore((state) => state.upsertCustomThemes);
	const systemLightThemeId = useSystemLightThemeId();
	const systemDarkThemeId = useSystemDarkThemeId();
	const setSystemThemePreference = useSetSystemThemePreference();

	const allThemes = [...builtInThemes, ...customThemes];
	const lightThemes = allThemes.filter((t) => t.type === "light");
	const darkThemes = allThemes.filter((t) => t.type === "dark");
	const builtInLightThemes = lightThemes.filter((t) => !t.isCustom);
	const builtInDarkThemes = darkThemes.filter((t) => !t.isCustom);
	const customLightThemes = lightThemes.filter((t) => t.isCustom);
	const customDarkThemes = darkThemes.filter((t) => t.isCustom);

	const allOptions: ReadonlyArray<{ group: string; themes: Theme[] }> = [
		{ group: t("appearance.light"), themes: builtInLightThemes },
		{ group: t("appearance.dark"), themes: builtInDarkThemes },
		...(customThemes.length > 0
			? [
					{
						group: t("appearance.custom"),
						themes: [...customLightThemes, ...customDarkThemes],
					},
				]
			: []),
	];
	const lightOptions: ReadonlyArray<{ group: string; themes: Theme[] }> =
		customLightThemes.length > 0
			? [
					{ group: t("appearance.light"), themes: builtInLightThemes },
					{ group: t("appearance.custom"), themes: customLightThemes },
				]
			: [{ group: t("appearance.light"), themes: builtInLightThemes }];
	const darkOptions: ReadonlyArray<{ group: string; themes: Theme[] }> =
		customDarkThemes.length > 0
			? [
					{ group: t("appearance.dark"), themes: builtInDarkThemes },
					{ group: t("appearance.custom"), themes: customDarkThemes },
				]
			: [{ group: t("appearance.dark"), themes: builtInDarkThemes }];

	const systemLightTheme =
		allThemes.find((t) => t.id === systemLightThemeId) ??
		builtInThemes.find((t) => t.id === "light") ??
		defaultLightTheme;
	const systemDarkTheme =
		allThemes.find((t) => t.id === systemDarkThemeId) ??
		builtInThemes.find((t) => t.id === "dark") ??
		defaultDarkTheme;

	const isSystemMode = activeThemeId === SYSTEM_THEME_ID;
	const currentTheme =
		allThemes.find((t) => t.id === activeThemeId) ?? systemDarkTheme;

	const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		if (file.size > MAX_THEME_FILE_SIZE) {
			toast.error(t("appearance.themeTooLarge"), {
				description: t("appearance.maxThemeSize"),
			});
			return;
		}

		setIsImporting(true);
		try {
			const content = await file.text();
			const parsed = parseThemeConfigFile(content);

			if (!parsed.ok) {
				toast.error(t("appearance.themeImportFailed"), {
					description: parsed.error,
				});
				return;
			}

			const summary = upsertCustomThemes(parsed.themes);
			const totalImported = summary.added + summary.updated;

			if (totalImported === 0) {
				toast.error(t("appearance.noThemesImported"), {
					description:
						summary.skipped > 0
							? t("appearance.reservedThemeIds")
							: t("appearance.noImportableThemes"),
				});
				return;
			}

			toast.success(
				totalImported === 1
					? t("appearance.oneThemeImported")
					: t("appearance.themesImported", { count: totalImported }),
				{
					description:
						summary.updated > 0
							? summary.updated === 1
								? t("appearance.oneThemeUpdated")
								: t("appearance.themesUpdated", { count: summary.updated })
							: undefined,
				},
			);

			if (parsed.issues.length > 0) {
				toast.warning(t("appearance.themesSkipped"), {
					description: parsed.issues[0],
				});
			}
		} catch (error) {
			toast.error(t("appearance.themeImportFailed"), {
				description:
					error instanceof Error
						? error.message
						: t("appearance.unableReadFile"),
			});
		} finally {
			setIsImporting(false);
		}
	};

	const handleDownloadBaseTheme = () => {
		const baseTheme = activeTheme ?? builtInThemes[0];
		if (!baseTheme) return;

		const baseConfig = {
			id: "my-custom-theme",
			name: "My Custom Theme",
			type: baseTheme.type,
			author: "You",
			description: "Custom Superset theme",
			ui: baseTheme.ui,
			terminal: getTerminalColors(baseTheme),
		};

		const blob = new Blob([JSON.stringify(baseConfig, null, 2)], {
			type: "application/json",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		link.download = "superset-theme-base.json";
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
			<ThemeRow
				label={t("appearance.theme")}
				hint={
					<>
						{t("appearance.themeHintPrefix")}{" "}
						<a
							href={`${COMPANY.MARKETING_URL}/marketplace/themes`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-0.5 text-primary hover:underline"
						>
							{t("appearance.marketplace")}
							<HiOutlineArrowTopRightOnSquare className="h-3 w-3" />
						</a>{" "}
						{t("appearance.or")}{" "}
						<a
							href={`${COMPANY.DOCS_URL}/custom-themes`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-0.5 text-primary hover:underline"
						>
							{t("appearance.docs")}
							<HiOutlineArrowTopRightOnSquare className="h-3 w-3" />
						</a>
						.
					</>
				}
				value={activeThemeId}
				onValueChange={setTheme}
				currentTheme={currentTheme}
				options={allOptions}
				includeSystem={{
					darkTheme: systemDarkTheme,
					lightTheme: systemLightTheme,
				}}
			/>
			{isSystemMode && (
				<>
					<ThemeRow
						label={t("appearance.lightTheme")}
						hint={t("appearance.lightThemeHint")}
						value={systemLightThemeId}
						onValueChange={(id) => setSystemThemePreference("light", id)}
						currentTheme={systemLightTheme}
						options={lightOptions}
					/>
					<ThemeRow
						label={t("appearance.darkTheme")}
						hint={t("appearance.darkThemeHint")}
						value={systemDarkThemeId}
						onValueChange={(id) => setSystemThemePreference("dark", id)}
						currentTheme={systemDarkTheme}
						options={darkOptions}
					/>
				</>
			)}
			<div className="flex items-center justify-between gap-6 p-4">
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">
						{t("commandPalette.custom")}
					</div>
					<div className="text-xs text-muted-foreground">
						{t("appearance.customThemeHint")}
					</div>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<input
						ref={fileInputRef}
						type="file"
						accept=".json,application/json"
						className="hidden"
						onChange={handleImport}
					/>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleDownloadBaseTheme}
					>
						<HiOutlineArrowDownTray className="mr-1.5 h-4 w-4" />
						{t("appearance.downloadStarter")}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => fileInputRef.current?.click()}
						disabled={isImporting}
					>
						<HiOutlineArrowUpTray className="mr-1.5 h-4 w-4" />
						{isImporting ? t("appearance.importing") : t("appearance.import")}
					</Button>
				</div>
			</div>
		</div>
	);
}
