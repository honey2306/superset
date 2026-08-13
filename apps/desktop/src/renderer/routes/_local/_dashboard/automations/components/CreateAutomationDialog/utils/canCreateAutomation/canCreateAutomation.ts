interface CanCreateAutomationInput {
	name: string;
	prompt: string;
	projectId: string | null;
	hostId: string | null;
	agentId: string | null;
	rrule: string;
	isPending: boolean;
}

export function canCreateAutomation({
	name,
	prompt,
	projectId,
	hostId,
	agentId,
	rrule,
	isPending,
}: CanCreateAutomationInput): boolean {
	return (
		name.trim().length > 0 &&
		prompt.trim().length > 0 &&
		!!projectId &&
		!!hostId &&
		!!agentId &&
		rrule.trim().length > 0 &&
		!isPending
	);
}
