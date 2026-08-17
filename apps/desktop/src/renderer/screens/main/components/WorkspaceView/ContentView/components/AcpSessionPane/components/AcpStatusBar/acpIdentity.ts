import type {
	SessionConfigOption,
	SessionModeState,
} from "@superset/session-protocol";

export type SelectConfigOption = Extract<
	SessionConfigOption,
	{ type: "select" }
>;

export interface AcpIdentityField<T> {
	label: string;
	control: T;
}

export type AcpConfigurableField =
	| (AcpIdentityField<SelectConfigOption> & { source: "config" })
	| (AcpIdentityField<SessionModeState> & { source: "mode" });

export interface AcpIdentity {
	mode: AcpConfigurableField | null;
	model: AcpIdentityField<SelectConfigOption> | null;
	thinking: AcpConfigurableField | null;
}

function normalized(value: string | null | undefined): string {
	return (value ?? "")
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[\s._:/-]+/g, "");
}

function flattenOptions(option: SelectConfigOption) {
	return option.options.flatMap((entry) =>
		"options" in entry ? entry.options : [entry],
	);
}

function selectedLabel(option: SelectConfigOption): string | null {
	const selected = flattenOptions(option).find(
		(entry) => entry.value === option.currentValue,
	);
	if (selected) return selected.name.trim();
	if (option.currentValue == null || option.currentValue === "") return null;
	return String(option.currentValue).trim();
}

function modelScore(option: SelectConfigOption): number {
	const id = normalized(option.id);
	const name = normalized(option.name);
	if (
		option.category === "thought_level" ||
		option.category === "mode" ||
		/^(?:effort|reasoning|reasoningeffort|thinking|thinkingeffort|thoughtlevel)$/.test(
			id,
		)
	)
		return 0;
	if (id === "model") return 300;
	if (name === "model") return 250;
	if (option.category === "model") return 200;
	if (id.endsWith("model")) return 100;
	return 0;
}

function modeScore(option: SelectConfigOption): number {
	const id = normalized(option.id);
	const name = normalized(option.name);
	if (option.category === "mode") return 400;
	if (id === "mode") return 300;
	if (name === "mode") return 250;
	return 0;
}

function thinkingScore(option: SelectConfigOption): number {
	const id = normalized(option.id);
	const name = normalized(option.name);
	if (option.category === "thought_level") return 400;
	if (
		/^(?:effort|reasoning|reasoningeffort|thinking|thinkingeffort|thought|thoughtlevel)$/.test(
			id,
		)
	)
		return 300;
	if (
		/^(?:effort|reasoning|reasoningeffort|thinking|thinkingeffort|thought|thoughtlevel)$/.test(
			name,
		)
	)
		return 250;
	if (/(?:thinking|reasoning|effort|thoughtlevel)/.test(`${id}${name}`))
		return 100;
	return 0;
}

function bestOption(
	options: readonly SessionConfigOption[],
	score: (option: SelectConfigOption) => number,
): SelectConfigOption | null {
	let selected: SelectConfigOption | null = null;
	let selectedScore = 0;
	for (const option of options) {
		if (option.type !== "select") continue;
		const candidateScore = score(option);
		if (candidateScore > selectedScore) {
			selected = option;
			selectedScore = candidateScore;
		}
	}
	return selected;
}

export function cleanModelLabel(raw: string): string {
	const withoutDetails = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
	return (withoutDetails.split("/").at(-1) ?? withoutDetails).trim();
}

export function cleanThinkingLabel(raw: string): string {
	return raw
		.replace(
			/^\s*(?:thinking|reasoning|thought(?:\s+level)?|effort)\s*[:=\-–—]\s*/i,
			"",
		)
		.trim();
}

function selectedModeLabel(mode: SessionModeState): string {
	return (
		mode.availableModes.find((entry) => entry.id === mode.currentModeId)
			?.name ?? mode.currentModeId
	).trim();
}

function looksLikeThinking(value: string): boolean {
	return /(?:thinking|reasoning|effort|thought)/.test(value.toLowerCase());
}

function modeRepresentsThinking(mode: SessionModeState): boolean {
	if (mode.availableModes.length === 0)
		return looksLikeThinking(
			`${mode.currentModeId} ${selectedModeLabel(mode)}`,
		);
	return mode.availableModes.every((entry) =>
		looksLikeThinking(`${entry.id} ${entry.name}`),
	);
}

/** Normalize agent-defined ACP metadata into one stable Mode / Model / Thinking shape. */
export function normalizeAcpIdentity(
	mode: SessionModeState | null,
	configOptions: readonly SessionConfigOption[],
): AcpIdentity {
	const modelOption = bestOption(configOptions, modelScore);
	const modeOption = bestOption(configOptions, modeScore);
	const thinkingOption = bestOption(configOptions, thinkingScore);
	const thinkingMode = mode && modeRepresentsThinking(mode) ? mode : null;
	const ordinaryMode = mode && !thinkingMode ? mode : null;
	const configModeLabel = modeOption ? selectedLabel(modeOption) : null;
	const configModeRepresentsThinking =
		configModeLabel != null && looksLikeThinking(configModeLabel);

	const modelLabel = modelOption ? selectedLabel(modelOption) : null;
	const configThinkingLabel = thinkingOption
		? selectedLabel(thinkingOption)
		: null;
	const modeThinkingLabel = thinkingMode
		? cleanThinkingLabel(selectedModeLabel(thinkingMode))
		: null;

	return {
		mode: ordinaryMode
			? {
					label: selectedModeLabel(ordinaryMode),
					control: ordinaryMode,
					source: "mode",
				}
			: modeOption && configModeLabel && !configModeRepresentsThinking
				? {
						label: configModeLabel,
						control: modeOption,
						source: "config",
					}
				: null,
		model:
			modelOption && modelLabel
				? { label: cleanModelLabel(modelLabel), control: modelOption }
				: null,
		thinking:
			thinkingOption && configThinkingLabel
				? {
						label: cleanThinkingLabel(configThinkingLabel),
						control: thinkingOption,
						source: "config",
					}
				: thinkingMode && modeThinkingLabel
					? {
							label: modeThinkingLabel,
							control: thinkingMode,
							source: "mode",
						}
					: modeOption && configModeLabel && configModeRepresentsThinking
						? {
								label: cleanThinkingLabel(configModeLabel),
								control: modeOption,
								source: "config",
							}
						: null,
	};
}
