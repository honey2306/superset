import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
} from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import type { CommandContext } from "./types";

const Context = createContext<CommandContext | null>(null);

export function CommandContextProvider({ children }: { children: ReactNode }) {
	const location = useLocation();
	const navigate = useNavigate();
	const {
		activeHostUrl,
		activeOrganizationId,
		activeOrganizationName,
		hostServiceStatus,
		machineId,
	} = useLocalHostService();
	const { t } = useTranslation();

	const navigateTo = useCallback(
		(path: string) => {
			void navigate({ to: path });
		},
		[navigate],
	);

	const { data: notificationSoundsMuted = false } =
		electronTrpc.settings.getNotificationSoundsMuted.useQuery();

	const context = useMemo<CommandContext>(
		() => ({
			route: { pathname: location.pathname, params: {} },
			workspace: null,
			activeHostUrl,
			activeOrganizationId,
			activeOrganizationName,
			hostServiceStatus,
			localMachineId: machineId ?? null,
			notificationSoundsMuted,
			navigate: navigateTo,
			t,
		}),
		[
			location.pathname,
			activeHostUrl,
			activeOrganizationId,
			activeOrganizationName,
			hostServiceStatus,
			machineId,
			notificationSoundsMuted,
			navigateTo,
			t,
		],
	);

	return <Context.Provider value={context}>{children}</Context.Provider>;
}

export function useCommandContext(): CommandContext {
	const ctx = useContext(Context);
	if (!ctx) {
		throw new Error(
			"useCommandContext must be used within CommandContextProvider",
		);
	}
	return ctx;
}
