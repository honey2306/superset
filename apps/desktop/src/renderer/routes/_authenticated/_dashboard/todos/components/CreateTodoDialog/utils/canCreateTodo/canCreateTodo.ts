interface CanCreateTodoInput {
	title: string;
	hasDueDate: boolean;
	mode: "manual" | "auto";
	hasAgent: boolean;
	hasSelectedProject: boolean;
	isTemporaryTarget: boolean;
	hasHost: boolean;
	hasWorkspace: boolean;
	prompt: string;
	isPending: boolean;
}

export function canCreateTodo({
	title,
	hasDueDate,
	mode,
	hasAgent,
	hasSelectedProject,
	isTemporaryTarget,
	hasHost,
	hasWorkspace,
	prompt,
	isPending,
}: CanCreateTodoInput): boolean {
	if (!title.trim() || !hasDueDate || isPending) return false;
	if (mode === "manual") return true;
	return (
		hasAgent &&
		(isTemporaryTarget || hasSelectedProject) &&
		hasHost &&
		(isTemporaryTarget || hasWorkspace) &&
		!!prompt.trim()
	);
}
