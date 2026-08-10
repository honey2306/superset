type MacBuildEnvironment = Record<string, string | undefined>;

const hasValue = (value: string | undefined) => value?.trim().length;

const hasAllValues = (
	environment: MacBuildEnvironment,
	variableNames: readonly string[],
) => variableNames.every((variableName) => hasValue(environment[variableName]));

export const shouldNotarizeMacBuild = (
	environment: MacBuildEnvironment = process.env,
) =>
	hasAllValues(environment, ["CSC_LINK", "CSC_KEY_PASSWORD"]) &&
	hasAllValues(environment, [
		"APPLE_ID",
		"APPLE_APP_SPECIFIC_PASSWORD",
		"APPLE_TEAM_ID",
	]);
