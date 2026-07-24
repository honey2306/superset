import type { AppRouter } from "@superset/host-service";
import type { inferRouterOutputs } from "@trpc/server";
import { Check } from "lucide-react";
import {
	type MessageKey,
	useTranslation,
} from "renderer/providers/I18nProvider";

type Commit =
	inferRouterOutputs<AppRouter>["git"]["listCommits"]["commits"][number];

function timeAgo(
	date: string,
	t: (key: MessageKey, params?: Record<string, number | string>) => string,
): string {
	const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
	if (seconds < 60) return t("v2Workspace.commits.justNow");
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return t("v2Workspace.commits.minutesAgo", { n: minutes });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return t("v2Workspace.commits.hoursAgo", { n: hours });
	const days = Math.floor(hours / 24);
	return t("v2Workspace.commits.daysAgo", { n: days });
}

interface CommitRowProps {
	commit: Commit;
	isSelected?: boolean;
	wrap?: boolean;
}

export function CommitRow({
	commit,
	isSelected,
	wrap = false,
}: CommitRowProps) {
	const { t } = useTranslation();
	return (
		<div className="flex min-w-0 flex-1 items-start justify-between gap-2">
			<div className="min-w-0 flex-1 overflow-hidden">
				<div className={wrap ? "text-sm wrap-break-word" : "truncate text-sm"}>
					{commit.message}
				</div>
				<div className="truncate text-xs text-muted-foreground">
					{commit.shortHash} · {commit.author} · {timeAgo(commit.date, t)}
				</div>
			</div>
			{isSelected && <Check className="mt-0.5 size-3.5 shrink-0" />}
		</div>
	);
}
