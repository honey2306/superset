import {
	ModelSelector,
	ModelSelectorContent,
	ModelSelectorEmpty,
	ModelSelectorGroup,
	ModelSelectorInput,
	ModelSelectorItem,
	ModelSelectorList,
} from "@superset/ui/ai-elements/model-selector";
import { useTranslation } from "renderer/providers/I18nProvider";
import type { McpOverviewPayload, McpServerOverviewItem } from "../../types";

interface McpOverviewPickerProps {
	overview: McpOverviewPayload | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAuthenticateServer?: (serverName: string) => Promise<void> | void;
	authenticatingServerName?: string | null;
}

function getStateClassName(state: McpServerOverviewItem["state"]): string {
	switch (state) {
		case "enabled":
			return "border-success bg-success-tint text-success dark:text-success";
		case "disabled":
			return "border-warning bg-warning-tint text-warning dark:text-warning";
		default:
			return "border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive";
	}
}

export function McpOverviewPicker({
	overview,
	open,
	onOpenChange,
	onAuthenticateServer,
	authenticatingServerName,
}: McpOverviewPickerProps) {
	const { t } = useTranslation();
	const servers = overview?.servers ?? [];

	const formatStateLabel = (state: McpServerOverviewItem["state"]): string => {
		switch (state) {
			case "enabled":
				return t("mcp.stateEnabled");
			case "disabled":
				return t("mcp.stateDisabled");
			default:
				return t("mcp.stateInvalid");
		}
	};

	const formatTransportLabel = (
		transport: McpServerOverviewItem["transport"],
	): string => {
		switch (transport) {
			case "remote":
				return t("mcp.transportRemote");
			case "local":
				return t("mcp.transportLocal");
			default:
				return t("common.unknown");
		}
	};

	return (
		<ModelSelector open={open} onOpenChange={onOpenChange}>
			<ModelSelectorContent className="max-w-2xl" title={t("mcp.serversTitle")}>
				<div className="border-b border-line/60 px-4 py-3">
					<div className="text-sm font-medium text-fg">
						{t("mcp.serversCount", { count: servers.length })}
					</div>
					<div className="mt-1 truncate text-xs text-fg-mute">
						{overview?.sourcePath
							? t("mcp.loadedFrom", { path: overview.sourcePath })
							: t("mcp.noConfig")}
					</div>
				</div>
				<ModelSelectorInput placeholder={t("mcp.searchMcp")} />
				<ModelSelectorList className="max-h-[420px]">
					<ModelSelectorEmpty>{t("mcp.noServers")}</ModelSelectorEmpty>
					<ModelSelectorGroup heading={t("mcp.serversHeading")}>
						{servers.map((server) => (
							<ModelSelectorItem
								key={server.name}
								value={`${server.name} ${server.target} ${server.transport} ${server.state} ${server.error ?? ""}`}
								onSelect={() => {
									if (
										!onAuthenticateServer ||
										server.transport !== "remote" ||
										server.state === "disabled"
									) {
										return;
									}
									void onAuthenticateServer(server.name);
								}}
							>
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-medium text-fg">
										{server.name}
									</div>
									<div className="truncate text-xs text-fg-mute">
										{server.target}
									</div>
									{server.error ? (
										<div className="truncate text-xs text-destructive">
											{server.error}
										</div>
									) : null}
								</div>
								<div className="ml-3 flex shrink-0 items-center gap-1.5">
									{server.connected === true ? (
										<span className="rounded-full border border-success bg-success-tint px-2 py-0.5 text-[11px] font-medium text-success dark:text-success">
											{t("common.connected")}
										</span>
									) : server.connected === false ? (
										<span className="rounded-full border border-zinc-500/30 bg-zinc-500/10 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
											{t("mcp.disconnected")}
										</span>
									) : null}
									<span className="rounded-full border border-line bg-hover px-2 py-0.5 text-[11px] font-medium text-fg-mute">
										{formatTransportLabel(server.transport)}
									</span>
									<span
										className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStateClassName(server.state)}`}
									>
										{formatStateLabel(server.state)}
									</span>
									{onAuthenticateServer &&
									server.transport === "remote" &&
									server.state !== "disabled" ? (
										<span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-fg">
											{authenticatingServerName === server.name
												? t("mcp.connecting")
												: server.connected
													? t("mcp.reauth")
													: t("mcp.auth")}
										</span>
									) : null}
								</div>
							</ModelSelectorItem>
						))}
					</ModelSelectorGroup>
				</ModelSelectorList>
			</ModelSelectorContent>
		</ModelSelector>
	);
}
