import { toast } from "@superset/ui/sonner";
import type { MessageKey } from "renderer/providers/I18nProvider";

export type HostServiceAvailabilityStatus =
	| "starting"
	| "running"
	| "stopped"
	| "unknown";

export interface HostServiceUnavailableContext {
	activeOrganizationId?: string | null;
	activeOrganizationName?: string | null;
	hostServiceStatus?: HostServiceAvailabilityStatus | null;
	machineId?: string | null;
}

type TranslateFunction = (
	key: MessageKey,
	values?: Record<string, number | string>,
) => string;

interface HostServiceUnavailableMessageOptions {
	/** Pre-translated action verb phrase (e.g. t("workspace.createAction")). */
	action?: string;
}

function shortId(id: string): string {
	return id.length > 8 ? id.slice(0, 8) : id;
}

function formatOrganization(
	context: HostServiceUnavailableContext,
	t: TranslateFunction,
): string {
	if (context.activeOrganizationName) {
		return t("hostService.organizationNamed", {
			name: context.activeOrganizationName,
		});
	}
	if (context.activeOrganizationId) {
		return t("hostService.organizationId", {
			id: shortId(context.activeOrganizationId),
		});
	}
	return t("hostService.organizationDefault");
}

function formatDevice(
	context: HostServiceUnavailableContext,
	t: TranslateFunction,
): string {
	return context.machineId
		? t("hostService.deviceWithId", { id: shortId(context.machineId) })
		: t("hostService.deviceDefault");
}

function getRecoveryText(
	status: HostServiceAvailabilityStatus,
	t: TranslateFunction,
): string {
	switch (status) {
		case "starting":
			return t("hostService.recovery.starting");
		case "stopped":
			return t("hostService.recovery.stopped");
		case "running":
			return t("hostService.recovery.running");
		case "unknown":
			return t("hostService.recovery.unknown");
	}
}

export function getHostServiceUnavailableMessage(
	context: HostServiceUnavailableContext,
	t: TranslateFunction,
	options: HostServiceUnavailableMessageOptions = {},
): string {
	if (!context.activeOrganizationId) {
		const message = t("hostService.noOrgSelected");
		return options.action
			? t("hostService.cannotAction", { action: options.action, message })
			: message;
	}

	const status = context.hostServiceStatus ?? "unknown";
	const organization = formatOrganization(context, t);
	const device = formatDevice(context, t);

	const message = `${t("hostService.unavailableFor", { organization, device })} ${t("hostService.status", { status })} ${getRecoveryText(status, t)}`;
	return options.action
		? t("hostService.cannotAction", { action: options.action, message })
		: message;
}

export function showHostServiceUnavailableToast(
	context: HostServiceUnavailableContext,
	t: TranslateFunction,
	options: HostServiceUnavailableMessageOptions = {},
): void {
	toast.error(t("hostService.title"), {
		description: getHostServiceUnavailableMessage(context, t, options),
	});
}
