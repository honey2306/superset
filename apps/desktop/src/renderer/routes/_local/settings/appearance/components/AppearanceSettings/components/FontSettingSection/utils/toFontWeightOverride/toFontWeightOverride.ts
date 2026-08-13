/** Treat the normal CSS weight as an inherited default rather than an override. */
export function toFontWeightOverride(
	weight: number | null | undefined,
): number | null {
	return weight === 400 || weight == null ? null : weight;
}
