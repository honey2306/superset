import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useTranslation } from "renderer/providers/I18nProvider";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";

export function SessionsSection() {
	const { t } = useTranslation();
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const client = useMemo(
		() => (activeHostUrl ? getHostServiceClientByUrl(activeHostUrl) : null),
		[activeHostUrl],
	);
	const sessionsQueryKey = ["terminal", "daemon", "sessions", activeHostUrl];
	const { data: daemonSessions } = useQuery({
		queryKey: sessionsQueryKey,
		enabled: client !== null,
		queryFn: () => client?.terminal.daemon.listManagedSessions.query(),
	});
	const sessions = daemonSessions?.sessions ?? [];
	const aliveSessions = useMemo(
		() => sessions.filter((session) => session.isAlive),
		[sessions],
	);
	const sessionsSorted = useMemo(
		() =>
			[...aliveSessions].sort(
				(a, b) =>
					(b.lastAttachedAt ?? b.createdAt ?? 0) -
					(a.lastAttachedAt ?? a.createdAt ?? 0),
			),
		[aliveSessions],
	);

	const [confirmKillAllOpen, setConfirmKillAllOpen] = useState(false);
	const [confirmClearHistoryOpen, setConfirmClearHistoryOpen] = useState(false);
	const [confirmRestartDaemonOpen, setConfirmRestartDaemonOpen] =
		useState(false);
	const [showSessionList, setShowSessionList] = useState(false);
	const [pendingKillSession, setPendingKillSession] = useState<{
		sessionId: string;
		workspaceId: string | null;
	} | null>(null);

	const invalidateSessions = () =>
		queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
	const killAllDaemonSessions = useMutation({
		mutationFn: async () => {
			if (!client) throw new Error("Host service is unavailable");
			return client.terminal.daemon.killAllSessions.mutate();
		},
		onSuccess: (result) => {
			if (result.remainingCount > 0) {
				toast.warning(t("terminal.someSessionsNotKilled"), {
					description: t("terminal.killCounts", {
						killed: result.killedCount,
						remaining: result.remainingCount,
					}),
				});
			} else {
				toast.success(t("terminal.killedAll"), {
					description: t("terminal.sessionsTerminated", {
						count: result.killedCount,
					}),
				});
			}
		},
		onError: (error) =>
			toast.error(t("terminal.killFailed"), { description: error.message }),
		onSettled: invalidateSessions,
	});
	const clearTerminalHistory = useMutation({
		mutationFn: async () => {
			if (!client) throw new Error("Host service is unavailable");
			return client.terminal.daemon.clearReplayBuffers.mutate();
		},
		onSuccess: () => toast.success(t("terminal.historyCleared")),
		onError: (error) =>
			toast.error(t("terminal.clearHistoryFailed"), {
				description: error.message,
			}),
	});
	const killDaemonSession = useMutation({
		mutationFn: async (sessionId: string) => {
			if (!client) throw new Error("Host service is unavailable");
			return client.terminal.daemon.killSession.mutate({ sessionId });
		},
		onSuccess: () => toast.success(t("terminal.sessionKilled")),
		onError: (error) =>
			toast.error(t("terminal.killSessionFailed"), {
				description: error.message,
			}),
		onSettled: invalidateSessions,
	});
	const restartDaemon = useMutation({
		mutationFn: async () => {
			if (!client) throw new Error("Host service is unavailable");
			return client.terminal.daemon.restart.mutate();
		},
		onSuccess: () => {
			toast.success(t("terminal.daemonRestarted"), {
				description: t("terminal.daemonRestartedDescription"),
			});
		},
		onError: (error) =>
			toast.error(t("terminal.restartFailed"), { description: error.message }),
		onSettled: invalidateSessions,
	});

	const formatTimestamp = (value?: number | null) =>
		value ? new Date(value).toLocaleString() : "—";

	return (
		<>
			<div className="rounded-ds-3 border border-line/60 p-4 space-y-3">
				<div className="space-y-0.5">
					<div className="flex items-center justify-between">
						<Label className="text-sm font-medium">
							{t("terminal.daemon")}
						</Label>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => invalidateSessions()}
						>
							{t("terminal.refresh")}
						</Button>
					</div>
					<p className="text-xs text-fg-mute">
						{t("terminal.sessionsRunning", { count: aliveSessions.length })}
					</p>
					{aliveSessions.length >= 20 && (
						<p className="text-xs text-fg-faint">
							{t("terminal.manySessionsWarning")}
						</p>
					)}
				</div>

				<div className="flex flex-wrap gap-2">
					<Button
						variant="destructive"
						size="sm"
						disabled={
							aliveSessions.length === 0 || killAllDaemonSessions.isPending
						}
						onClick={() => setConfirmKillAllOpen(true)}
					>
						{t("terminal.killAllSessions")}
					</Button>
					<Button
						variant="secondary"
						size="sm"
						disabled={
							aliveSessions.length === 0 || clearTerminalHistory.isPending
						}
						onClick={() => setConfirmClearHistoryOpen(true)}
					>
						{t("terminal.clearHistory")}
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={restartDaemon.isPending}
						onClick={() => setConfirmRestartDaemonOpen(true)}
					>
						{t("terminal.restartDaemon")}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						disabled={aliveSessions.length === 0}
						onClick={() => setShowSessionList((v) => !v)}
					>
						{showSessionList
							? t("terminal.hideSessions")
							: t("terminal.showSessions")}
					</Button>
				</div>

				{showSessionList && aliveSessions.length > 0 && (
					<div className="rounded-ds-3 border border-line/60 overflow-hidden">
						<div className="max-h-64 overflow-auto">
							<table className="w-full text-xs">
								<thead className="sticky top-0 bg-background">
									<tr className="text-fg-mute">
										<th className="px-2 py-2 text-left font-medium">
											{t("terminal.workspace")}
										</th>
										<th className="px-2 py-2 text-left font-medium">
											{t("terminal.session")}
										</th>
										<th className="px-2 py-2 text-right font-medium">PID</th>
										<th className="px-2 py-2 text-left font-medium">
											{t("terminal.lastAttached")}
										</th>
										<th className="px-2 py-2 text-right font-medium">
											{t("terminal.action")}
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border/60">
									{sessionsSorted.map((session) => (
										<tr key={session.sessionId} className="hover:bg-hover/30">
											<td className="px-2 py-2 font-mono">
												{session.workspaceId ?? "Unmanaged"}
											</td>
											<td className="px-2 py-2 font-mono">
												{session.sessionId}
											</td>
											<td className="px-2 py-2 text-right font-mono">
												{session.pid ?? "—"}
											</td>
											<td className="px-2 py-2">
												{formatTimestamp(session.lastAttachedAt)}
											</td>
											<td className="px-2 py-2 text-right">
												<Button
													variant="ghost"
													size="sm"
													onClick={() =>
														setPendingKillSession({
															sessionId: session.sessionId,
															workspaceId: session.workspaceId,
														})
													}
												>
													{t("terminal.kill")}
												</Button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</div>

			<AlertDialog
				open={confirmKillAllOpen}
				onOpenChange={setConfirmKillAllOpen}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							{t("terminal.killAllTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-fg-mute space-y-1.5">
								<span className="block">
									{t("terminal.killAllDescription")}
								</span>
								<span className="block">{t("terminal.killAllWarning")}</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmKillAllOpen(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							variant="destructive"
							size="sm"
							disabled={killAllDaemonSessions.isPending}
							onClick={() => {
								setConfirmKillAllOpen(false);
								killAllDaemonSessions.mutate();
							}}
						>
							{t("terminal.killAll")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={confirmClearHistoryOpen}
				onOpenChange={setConfirmClearHistoryOpen}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							{t("terminal.clearHistoryTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-fg-mute space-y-1.5">
								<span className="block">
									{t("terminal.clearHistoryDescription")}
								</span>
								<span className="block">
									{t("terminal.clearHistoryWarning")}
								</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmClearHistoryOpen(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							variant="secondary"
							size="sm"
							disabled={clearTerminalHistory.isPending}
							onClick={() => {
								setConfirmClearHistoryOpen(false);
								clearTerminalHistory.mutate();
							}}
						>
							{t("terminal.clearHistory")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={!!pendingKillSession}
				onOpenChange={(open) => {
					if (!open) setPendingKillSession(null);
				}}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							{t("terminal.killSessionTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-fg-mute space-y-1.5">
								<span className="block">
									{t("terminal.killSessionDescription")}
								</span>
								{pendingKillSession && (
									<span className="block font-mono text-xs">
										{pendingKillSession.workspaceId} /{" "}
										{pendingKillSession.sessionId}
									</span>
								)}
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setPendingKillSession(null)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							variant="destructive"
							size="sm"
							disabled={killDaemonSession.isPending}
							onClick={() => {
								const sessionId = pendingKillSession?.sessionId;
								setPendingKillSession(null);
								if (!sessionId) return;
								killDaemonSession.mutate(sessionId);
							}}
						>
							{t("terminal.kill")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={confirmRestartDaemonOpen}
				onOpenChange={setConfirmRestartDaemonOpen}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							{t("terminal.restartTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-fg-mute space-y-1.5">
								<span className="block">
									{t("terminal.restartDescription")}
								</span>
								<span className="block">{t("terminal.restartHint")}</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmRestartDaemonOpen(false)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							variant="default"
							size="sm"
							disabled={restartDaemon.isPending}
							onClick={() => {
								setConfirmRestartDaemonOpen(false);
								restartDaemon.mutate();
							}}
						>
							{t("terminal.restartDaemon")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
