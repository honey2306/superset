import { useCallback, useMemo } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	buildChangesSidebarFileHint,
	type ChangesSidebarFileIntent,
	resolveChangesSidebarFileIntent,
	tierForChangesSidebarFileIntent,
} from "./changesSidebarFilePolicy";
import { useSidebarFilePolicy } from "./useSidebarFilePolicy";

export function useChangesSidebarFilePolicy() {
	const { t } = useTranslation();
	const policy = useSidebarFilePolicy();

	const getIntent = useCallback(
		(event: Parameters<typeof resolveChangesSidebarFileIntent>[1]) =>
			resolveChangesSidebarFileIntent(policy.map, event),
		[policy.map],
	);
	const tierForIntent = useCallback(
		(intent: ChangesSidebarFileIntent) =>
			tierForChangesSidebarFileIntent(policy.map, intent),
		[policy.map],
	);
	const hint = useMemo(
		() => buildChangesSidebarFileHint(policy.map, t),
		[policy.map, t],
	);

	return { ...policy, getIntent, tierForIntent, hint };
}
