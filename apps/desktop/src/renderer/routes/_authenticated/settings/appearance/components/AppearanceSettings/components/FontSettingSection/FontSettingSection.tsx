import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useCallback, useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	DEFAULT_TERMINAL_FONT_FAMILY,
	DEFAULT_TERMINAL_FONT_SIZE,
} from "renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/config";
import {
	DEFAULT_CODE_EDITOR_FONT_FAMILY,
	DEFAULT_CODE_EDITOR_FONT_SIZE,
} from "renderer/screens/main/components/WorkspaceView/components/CodeEditor/constants";
import { FontFamilyCombobox } from "./components/FontFamilyCombobox";
import { FontPreview } from "./components/FontPreview";
import { useSystemFonts } from "./hooks/useSystemFonts";
import { toFontWeightOverride } from "./utils/toFontWeightOverride";

const VARIANT_CONFIG = {
	editor: {
		titleKey: "appearance.editorFont",
		descriptionKey: "appearance.editorFontDescription",
		defaultFamily: DEFAULT_CODE_EDITOR_FONT_FAMILY,
		defaultSize: DEFAULT_CODE_EDITOR_FONT_SIZE,
		familyKey: "editorFontFamily",
		sizeKey: "editorFontSize",
	},
	terminal: {
		titleKey: "appearance.terminalFont",
		descriptionKey: "appearance.terminalFontDescription",
		defaultFamily: DEFAULT_TERMINAL_FONT_FAMILY,
		defaultSize: DEFAULT_TERMINAL_FONT_SIZE,
		familyKey: "terminalFontFamily",
		sizeKey: "terminalFontSize",
	},
} as const;

interface FontSettingSectionProps {
	variant: "editor" | "terminal";
}

export function FontSettingSection({ variant }: FontSettingSectionProps) {
	const { t } = useTranslation();
	const config = VARIANT_CONFIG[variant];

	const utils = electronTrpc.useUtils();

	const { data: fontSettings, isLoading } =
		electronTrpc.settings.getFontSettings.useQuery();

	const setFontSettings = electronTrpc.settings.setFontSettings.useMutation({
		onMutate: async (input) => {
			await utils.settings.getFontSettings.cancel();
			const previous = utils.settings.getFontSettings.getData();
			utils.settings.getFontSettings.setData(undefined, (old) =>
				old ? { ...old, ...input } : old,
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous !== undefined) {
				utils.settings.getFontSettings.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.settings.getFontSettings.invalidate();
		},
	});

	const { fonts: systemFonts, isLoading: fontsLoading } = useSystemFonts();

	const [fontSizeDraft, setFontSizeDraft] = useState<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync draft state when fontSettings changes
	useEffect(() => {
		setFontSizeDraft(null);
	}, [fontSettings]);

	const currentFamily = fontSettings?.[config.familyKey] ?? null;
	const currentSize = fontSettings?.[config.sizeKey] ?? null;
	const prefix = variant === "terminal" ? "terminal" : "editor";
	const update = (key: string, value: boolean | number | string | null) =>
		setFontSettings.mutate({ [key]: value });

	const handleFontFamilyChange = useCallback(
		(value: string | null) => {
			setFontSettings.mutate({
				[config.familyKey]: value,
			});
		},
		[setFontSettings, config.familyKey],
	);

	const handleFontSizeBlur = useCallback(
		(e: React.FocusEvent<HTMLInputElement>) => {
			const value = Number.parseInt(e.target.value, 10);
			if (!Number.isNaN(value) && value >= 10 && value <= 24) {
				setFontSettings.mutate({ [config.sizeKey]: value });
			}
		},
		[setFontSettings, config.sizeKey],
	);

	const previewFamily = currentFamily ?? config.defaultFamily;
	const previewSize =
		(fontSizeDraft != null ? Number.parseInt(fontSizeDraft, 10) : undefined) ||
		currentSize ||
		config.defaultSize;

	return (
		<div>
			<h3 className="text-sm font-medium mb-1">{t(config.titleKey)}</h3>
			<p className="text-xs text-muted-foreground mb-3">
				{t(config.descriptionKey)}
				{variant === "terminal" && (
					<>
						{" "}
						<a
							href="https://www.nerdfonts.com"
							target="_blank"
							rel="noopener noreferrer"
							className="text-primary hover:underline"
						>
							Nerd Fonts
						</a>{" "}
						{t("appearance.nerdFontsRecommended")}
					</>
				)}
			</p>
			<div className="flex items-center gap-2">
				<FontFamilyCombobox
					value={currentFamily}
					defaultValue={config.defaultFamily}
					onValueChange={handleFontFamilyChange}
					disabled={isLoading}
					variant={variant}
					fonts={systemFonts}
					fontsLoading={fontsLoading}
				/>
				<Input
					type="number"
					min={10}
					max={24}
					value={fontSizeDraft ?? String(currentSize ?? config.defaultSize)}
					onChange={(e) => setFontSizeDraft(e.target.value)}
					onBlur={(e) => {
						handleFontSizeBlur(e);
						setFontSizeDraft(null);
					}}
					disabled={isLoading}
					className="w-20"
					aria-label={t("appearance.fontSize", {
						font: t(config.titleKey),
					})}
				/>
				{(currentFamily || currentSize) && (
					<Button
						variant="outline"
						size="sm"
						className="shrink-0"
						onClick={() => {
							setFontSettings.mutate({
								[config.familyKey]: null,
								[config.sizeKey]: null,
							});
							setFontSizeDraft(null);
						}}
					>
						{t("common.reset")}
					</Button>
				)}
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
				<div>
					Line height
					<Input
						type="number"
						min={1}
						max={2.5}
						step={0.1}
						value={
							(fontSettings?.[
								`${prefix}LineHeight` as keyof typeof fontSettings
							] as number | null) ?? 1.5
						}
						onChange={(e) =>
							update(`${prefix}LineHeight`, Number(e.target.value))
						}
					/>
				</div>
				<div>
					Letter spacing
					<Input
						type="number"
						min={-2}
						max={4}
						step={0.1}
						value={
							(fontSettings?.[
								`${prefix}LetterSpacing` as keyof typeof fontSettings
							] as number | null) ?? 0
						}
						onChange={(e) =>
							update(`${prefix}LetterSpacing`, Number(e.target.value))
						}
					/>
				</div>
				<div>
					Weight
					<select
						className="w-full h-9 border rounded px-2"
						value={
							(fontSettings?.[
								`${prefix}FontWeight` as keyof typeof fontSettings
							] as number | null) ?? 400
						}
						onChange={(e) =>
							update(
								`${prefix}FontWeight`,
								toFontWeightOverride(Number(e.target.value)),
							)
						}
					>
						{[100, 200, 300, 400, 500, 600, 700, 800, 900].map((weight) => (
							<option key={weight} value={weight}>
								{weight}
							</option>
						))}
					</select>
				</div>
				<label className="flex items-center gap-2 pt-5">
					<input
						type="checkbox"
						checked={
							(fontSettings?.[
								`${prefix}Ligatures` as keyof typeof fontSettings
							] as boolean | null) ?? true
						}
						onChange={(e) => update(`${prefix}Ligatures`, e.target.checked)}
					/>
					Ligatures
				</label>
				{variant === "terminal" && (
					<>
						<label>
							Contrast
							<select
								className="w-full h-9 border rounded px-2"
								value={fontSettings?.terminalMinimumContrast ?? 1}
								onChange={(e) =>
									update("terminalMinimumContrast", Number(e.target.value))
								}
							>
								{[1, 3, 4.5, 7].map((value) => (
									<option key={value} value={value}>
										{value}
									</option>
								))}
							</select>
						</label>
						<label>
							Cursor
							<select
								className="w-full h-9 border rounded px-2"
								value={fontSettings?.terminalCursorStyle ?? "block"}
								onChange={(e) => update("terminalCursorStyle", e.target.value)}
							>
								{["block", "bar", "underline"].map((value) => (
									<option key={value} value={value}>
										{value}
									</option>
								))}
							</select>
						</label>
						<label className="flex items-center gap-2">
							<input
								type="checkbox"
								checked={fontSettings?.terminalCursorBlink ?? true}
								onChange={(e) =>
									update("terminalCursorBlink", e.target.checked)
								}
							/>
							Blink cursor
						</label>
					</>
				)}
			</div>
			<div className="mt-3">
				<FontPreview
					fontFamily={previewFamily}
					fontSize={previewSize}
					variant={variant}
					isCustomFont={currentFamily !== null}
				/>
			</div>
		</div>
	);
}
