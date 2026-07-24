import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { useEffect, useMemo, useState } from "react";
import {
	HiMiniArrowPath,
	HiMiniChevronDown,
	HiMiniPlus,
} from "react-icons/hi2";
import { useTranslation } from "renderer/providers/I18nProvider";
import { NEW_CHAT_PANE_NAME } from "renderer/stores/tabs/utils";
import { getRelativeTime } from "../../../../../../../WorkspacesListView/utils";
import { SessionSelectorItem } from "./components/SessionSelectorItem";

interface SessionItem {
	sessionId: string;
	title: string;
	updatedAt: Date;
}

interface SessionSelectorProps {
	currentSessionId: string | null;
	sessions: SessionItem[];
	fallbackTitle?: string;
	isSessionInitializing?: boolean;
	onSelectSession: (sessionId: string) => void;
	onNewChat: () => Promise<void>;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

interface SessionGroup {
	label: string;
	sessions: SessionItem[];
}

const SESSION_PAGE_SIZE = 20;

type TranslationFn = (
	key:
		| "chat.session.today"
		| "chat.session.yesterday"
		| "chat.session.last7Days"
		| "chat.session.last30Days",
) => string;

function toSessionGroupLabel(updatedAt: Date, t: TranslationFn): string {
	const startOfToday = new Date();
	startOfToday.setHours(0, 0, 0, 0);

	const startOfYesterday = new Date(startOfToday);
	startOfYesterday.setDate(startOfYesterday.getDate() - 1);

	const startOfLastWeek = new Date(startOfToday);
	startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

	const startOfLastMonth = new Date(startOfToday);
	startOfLastMonth.setDate(startOfLastMonth.getDate() - 30);

	if (updatedAt >= startOfToday) return t("chat.session.today");
	if (updatedAt >= startOfYesterday) return t("chat.session.yesterday");
	if (updatedAt >= startOfLastWeek) return t("chat.session.last7Days");
	if (updatedAt >= startOfLastMonth) return t("chat.session.last30Days");
	return getRelativeTime(updatedAt.getTime());
}

function groupSessionsByAge(
	sessions: SessionItem[],
	t: TranslationFn,
): SessionGroup[] {
	const groups: SessionGroup[] = [];

	for (const session of sessions) {
		const label = toSessionGroupLabel(session.updatedAt, t);
		const lastGroup = groups[groups.length - 1];

		if (lastGroup?.label === label) {
			lastGroup.sessions.push(session);
			continue;
		}

		groups.push({ label, sessions: [session] });
	}

	return groups;
}

export function SessionSelector({
	currentSessionId,
	sessions,
	fallbackTitle,
	isSessionInitializing = false,
	onSelectSession,
	onNewChat,
	onDeleteSession,
}: SessionSelectorProps) {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const [visibleCount, setVisibleCount] = useState(SESSION_PAGE_SIZE);

	const visibleSessions = useMemo(
		() => sessions.slice(0, visibleCount),
		[sessions, visibleCount],
	);
	const groupedSessions = useMemo(
		() => groupSessionsByAge(visibleSessions, t),
		[visibleSessions, t],
	);
	const hasMoreSessions = sessions.length > visibleCount;

	useEffect(() => {
		if (!isOpen) return;
		setVisibleCount(SESSION_PAGE_SIZE);
	}, [isOpen]);

	const loadMoreSessions = () => {
		setVisibleCount((count) =>
			Math.min(count + SESSION_PAGE_SIZE, sessions.length),
		);
	};

	const current = sessions.find(
		(session) => session.sessionId === currentSessionId,
	);
	const newChatTitle = t("chat.pane.newChat");
	const resolvedFallbackTitle =
		fallbackTitle &&
		fallbackTitle !== NEW_CHAT_PANE_NAME &&
		fallbackTitle !== newChatTitle
			? fallbackTitle
			: null;
	const currentTitle =
		current?.title ||
		resolvedFallbackTitle ||
		(isSessionInitializing ? t("chat.session.creatingChat") : newChatTitle);

	return (
		<DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-busy={isSessionInitializing}
					className="flex w-full min-w-0 flex-1 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<HiMiniChevronDown className="size-3" />
					<span className="min-w-0 flex-1 truncate text-left">
						{currentTitle}
					</span>
					{isSessionInitializing && (
						<HiMiniArrowPath className="size-3 animate-spin" />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-80">
				<DropdownMenuLabel className="text-xs">
					{t("chat.session.sessions")}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<div className="max-h-80 overflow-y-auto">
					{sessions.length > 0 ? (
						<>
							{groupedSessions.map((group, index) => (
								<div
									key={`${group.label}-${group.sessions[0]?.sessionId ?? index}`}
									className={
										index > 0 ? "mt-1 border-t border-border/50 pt-1" : ""
									}
								>
									<div className="px-2 py-1 text-xs text-muted-foreground">
										{group.label}
									</div>
									{group.sessions.map((session) => (
										<SessionSelectorItem
											key={session.sessionId}
											sessionId={session.sessionId}
											title={session.title}
											isCurrent={session.sessionId === currentSessionId}
											onSelectSession={(sessionId) => {
												onSelectSession(sessionId);
												setIsOpen(false);
											}}
											onDeleteSession={onDeleteSession}
										/>
									))}
								</div>
							))}
							{hasMoreSessions && (
								<div className="px-2 py-1.5">
									<button
										type="button"
										className="w-full rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
										onClick={loadMoreSessions}
									>
										{t("chat.session.showMoreSessions")}
									</button>
								</div>
							)}
						</>
					) : (
						<div className="px-2 py-1.5 text-xs text-muted-foreground">
							{t("chat.session.noSessionsYet")}
						</div>
					)}
				</div>

				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => {
						void onNewChat();
						setIsOpen(false);
					}}
				>
					<HiMiniPlus className="mr-1.5 size-3.5" />
					<span className="text-xs">{t("chat.pane.newChat")}</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
