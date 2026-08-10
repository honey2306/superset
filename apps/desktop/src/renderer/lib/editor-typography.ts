/** Keep the historic 1.5× rounded editor line height until a user overrides it. */
export function resolveEditorLineHeight(
	fontSize: number,
	lineHeight?: number | null,
): number {
	return lineHeight == null
		? Math.round(fontSize * 1.5)
		: fontSize * lineHeight;
}

export function resolveFontVariantLigatures(
	ligatures?: boolean | null,
): "normal" | "none" | undefined {
	if (ligatures == null) return undefined;
	return ligatures ? "normal" : "none";
}
