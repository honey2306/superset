import { useEffect, useRef } from "react";
import { useDashboardSidebarState } from "renderer/routes/_local/hooks/useDashboardSidebarState";
import { useLocalCollections } from "renderer/routes/_local/providers/LocalProductStateProvider";
import { useSetPreferredOpenInAppIntent } from "renderer/stores/set-preferred-open-in-app-intent";

export function SetPreferredOpenInAppMount() {
	const target = useSetPreferredOpenInAppIntent((s) => s.target);
	const clear = useSetPreferredOpenInAppIntent((s) => s.clear);
	const collections = useLocalCollections();
	const { ensureProjectInSidebar } = useDashboardSidebarState();
	const lastTickRef = useRef(0);

	useEffect(() => {
		if (!target || target.tick === lastTickRef.current) return;
		lastTickRef.current = target.tick;
		ensureProjectInSidebar(target.projectId);
		collections.sidebarProjects.update(target.projectId, (draft) => {
			draft.defaultOpenInApp = target.app;
		});
		clear();
	}, [target, ensureProjectInSidebar, collections, clear]);

	return null;
}
