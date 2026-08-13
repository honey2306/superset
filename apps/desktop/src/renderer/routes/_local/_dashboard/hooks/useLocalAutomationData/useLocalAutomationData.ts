import { useQuery } from "@tanstack/react-query";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export type LocalAutomation = Awaited<
	ReturnType<HostServiceClient["automations"]["list"]["query"]>
>[number];
export type LocalAutomationRun = Awaited<
	ReturnType<HostServiceClient["automations"]["listRuns"]["query"]>
>[number];
export type LocalTodo = Awaited<
	ReturnType<HostServiceClient["todos"]["list"]["query"]>
>[number];

export const localAutomationKeys = {
	automations: (hostUrl: string | null) =>
		["local-automations", hostUrl] as const,
	automation: (hostUrl: string | null, id: string) =>
		["local-automation", hostUrl, id] as const,
	runs: (hostUrl: string | null, id: string) =>
		["local-automation-runs", hostUrl, id] as const,
	todos: (hostUrl: string | null) => ["local-todos", hostUrl] as const,
};

/** Local host-service data for desktop-only automations and todos. */
export function useLocalAutomations() {
	const hostUrl = useHostUrl(null);
	return useQuery({
		queryKey: localAutomationKeys.automations(hostUrl),
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] as LocalAutomation[];
			return getHostServiceClientByUrl(hostUrl).automations.list.query();
		},
		refetchInterval: 15_000,
	});
}

export function useLocalTodos() {
	const hostUrl = useHostUrl(null);
	return useQuery({
		queryKey: localAutomationKeys.todos(hostUrl),
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] as LocalTodo[];
			return getHostServiceClientByUrl(hostUrl).todos.list.query();
		},
		refetchInterval: 15_000,
	});
}
