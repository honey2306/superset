import type { SessionScopedState } from "@superset/session-protocol";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { LuMessageSquare } from "react-icons/lu";
import { createDesktopAcpSessionClient } from "renderer/lib/acp-session-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { navigateToWorkspace } from "renderer/routes/_local/_dashboard/utils/workspace-navigation";
import { useMaybeLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { useCatalogWorkspaces } from "renderer/routes/_local/providers/WorkspaceCatalogProvider/selectors";

interface ConversationSearchDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ConversationSearchDialog({
	open,
	onOpenChange,
}: ConversationSearchDialogProps) {
	const { locale, t } = useTranslation();
	const navigate = useNavigate();
	const hostUrl = useMaybeLocalHostService()?.activeHostUrl ?? null;
	const { workspaces } = useCatalogWorkspaces();
	const [sessions, setSessions] = useState<SessionScopedState[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isEnabled, setIsEnabled] = useState(true);
	const [hasError, setHasError] = useState(false);
	const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		if (!hostUrl) {
			setSessions([]);
			setIsLoading(false);
			setHasError(false);
			return;
		}

		let cancelled = false;
		setIsLoading(true);
		setIsEnabled(true);
		setHasError(false);

		void (async () => {
			try {
				const client = createDesktopAcpSessionClient(hostUrl);
				const items: SessionScopedState[] = [];
				let cursor: string | undefined;
				let enabled = true;

				do {
					const page = await client.list({ cursor, limit: 200 });
					enabled = page.enabled;
					items.push(...page.items);
					cursor = page.nextCursor ?? undefined;
				} while (enabled && cursor && !cancelled);

				if (cancelled) return;
				setIsEnabled(enabled);
				setSessions(items.sort((a, b) => b.updatedAt - a.updatedAt));
			} catch (error) {
				if (cancelled) return;
				console.error("[conversation-search] Failed to list sessions", error);
				setSessions([]);
				setHasError(true);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [hostUrl, open]);

	const workspaceNames = useMemo(
		() =>
			new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
		[workspaces],
	);
	const dateFormatter = useMemo(
		() =>
			new Intl.DateTimeFormat(locale, {
				dateStyle: "medium",
				timeStyle: "short",
			}),
		[locale],
	);

	const handleSelect = async (session: SessionScopedState) => {
		if (openingSessionId) return;
		setOpeningSessionId(session.sessionId);
		try {
			await navigateToWorkspace(session.workspaceId, navigate, {
				search: {
					acpSessionId: session.sessionId,
					focusRequestId: crypto.randomUUID(),
				},
			});
			onOpenChange(false);
		} catch (error) {
			console.error("[conversation-search] Failed to open session", error);
			toast.error(t("conversationSearch.openError"));
		} finally {
			setOpeningSessionId(null);
		}
	};

	const unavailableMessage = !hostUrl
		? t("conversationSearch.hostUnavailable")
		: hasError
			? t("conversationSearch.error")
			: !isEnabled
				? t("conversationSearch.unavailable")
				: null;

	return (
		<Dialog modal open={open} onOpenChange={onOpenChange}>
			<DialogContent
				showCloseButton={false}
				className="!max-w-[640px] !border-border !bg-popover !text-popover-foreground translate-y-0 overflow-hidden p-0 sm:!max-w-[640px]"
				style={{ top: "max(16px, calc(50% - 240px))" }}
			>
				<DialogHeader className="sr-only">
					<DialogTitle>{t("conversationSearch.title")}</DialogTitle>
					<DialogDescription>
						{t("conversationSearch.description")}
					</DialogDescription>
				</DialogHeader>
				<Command
					label={t("conversationSearch.title")}
					className="!bg-popover !text-popover-foreground **:data-[slot=command-input-wrapper]:border-border [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:h-auto [&_[cmdk-item]]:py-2.5"
				>
					<CommandInput
						aria-label={t("conversationSearch.placeholder")}
						className="text-popover-foreground placeholder:text-muted-foreground"
						placeholder={t("conversationSearch.placeholder")}
					/>
					<CommandList className="max-h-[420px]">
						{isLoading ? (
							<output className="block py-10 text-center text-xs text-muted-foreground">
								{t("conversationSearch.loading")}
							</output>
						) : unavailableMessage ? (
							<output className="block py-10 text-center text-xs text-muted-foreground">
								{unavailableMessage}
							</output>
						) : (
							<>
								<CommandEmpty className="text-muted-foreground">
									{t("conversationSearch.empty")}
								</CommandEmpty>
								<CommandGroup heading={t("conversationSearch.recent")}>
									{sessions.map((session) => {
										const workspaceName =
											workspaceNames.get(session.workspaceId) ?? session.cwd;
										const title =
											session.title ?? t("conversationSearch.untitled");
										return (
											<CommandItem
												key={session.sessionId}
												value={`${session.sessionId} ${title} ${workspaceName} ${session.cwd} ${session.harness}`}
												disabled={openingSessionId !== null}
												onSelect={() => void handleSelect(session)}
												className="gap-3 text-popover-foreground data-[selected=true]:text-accent-foreground"
											>
												<LuMessageSquare className="size-4 text-muted-foreground" />
												<div className="min-w-0 flex-1">
													<div className="truncate text-sm text-popover-foreground">
														{title}
													</div>
													<div className="flex gap-2 text-[11px] text-muted-foreground">
														<span className="truncate">{workspaceName}</span>
														<span aria-hidden="true">·</span>
														<span className="shrink-0">
															{dateFormatter.format(session.updatedAt)}
														</span>
													</div>
												</div>
											</CommandItem>
										);
									})}
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</DialogContent>
		</Dialog>
	);
}
