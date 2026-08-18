import { type ReactNode, useRef } from "react";

interface KeepAliveWorkspaceSurfacesProps {
	isChangesActive: boolean;
	renderContent: (isActive: boolean) => ReactNode;
	renderChanges: () => ReactNode;
}

export function KeepAliveWorkspaceSurfaces({
	isChangesActive,
	renderContent,
	renderChanges,
}: KeepAliveWorkspaceSurfacesProps) {
	const hasVisitedChangesRef = useRef(isChangesActive);
	if (isChangesActive) hasVisitedChangesRef.current = true;

	return (
		<>
			<div
				data-workspace-surface="content"
				aria-hidden={isChangesActive}
				className={isChangesActive ? "hidden" : "h-full"}
			>
				{renderContent(!isChangesActive)}
			</div>
			{hasVisitedChangesRef.current && (
				<div
					data-workspace-surface="changes"
					aria-hidden={!isChangesActive}
					className={isChangesActive ? "h-full" : "hidden"}
				>
					{renderChanges()}
				</div>
			)}
		</>
	);
}
