import { Spinner } from "@superset/ui/spinner";

function WorkspaceLoadingState() {
	return (
		<output
			className="flex h-full w-full flex-1 flex-col items-center justify-center gap-2 text-sm text-fg-mute"
			aria-live="polite"
			aria-busy="true"
		>
			<Spinner aria-hidden="true" className="size-5" />
			<span>Loading workspace…</span>
		</output>
	);
}

export { WorkspaceLoadingState };
