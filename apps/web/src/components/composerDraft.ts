export function draftToRestore({
	currentVersion,
	submissionVersion,
	submittedText,
}: {
	currentVersion: number;
	submissionVersion: number;
	submittedText: string;
}): string | null {
	return currentVersion === submissionVersion ? submittedText : null;
}
