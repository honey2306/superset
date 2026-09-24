import type { TaskStatus } from "@superset/shared/tasks";
import { cn } from "@superset/ui/utils";
import {
	Circle,
	CircleCheck,
	CirclePause,
	CircleX,
	Clock3,
	LoaderCircle,
	TriangleAlert,
} from "lucide-react";
import { useTranslation } from "renderer/providers/I18nProvider";

const appearance: Record<
	TaskStatus,
	{ icon: typeof Circle; tone: string; spin?: boolean }
> = {
	queued: { icon: Clock3, tone: "text-muted-foreground bg-muted/60" },
	running: {
		icon: LoaderCircle,
		tone: "text-[var(--accent-solid)] bg-[var(--accent-tint)]",
		spin: true,
	},
	blocked: {
		icon: TriangleAlert,
		tone: "text-[var(--warning)] bg-[var(--warning-tint)]",
	},
	awaiting_review: {
		icon: Circle,
		tone: "text-[var(--warning)] bg-[var(--warning-tint)]",
	},
	recovering: {
		icon: LoaderCircle,
		tone: "text-[var(--warning)] bg-[var(--warning-tint)]",
		spin: true,
	},
	pausing: {
		icon: LoaderCircle,
		tone: "text-muted-foreground bg-muted/60",
		spin: true,
	},
	cancelling: {
		icon: LoaderCircle,
		tone: "text-muted-foreground bg-muted/60",
		spin: true,
	},
	paused: { icon: CirclePause, tone: "text-muted-foreground bg-muted/60" },
	succeeded: {
		icon: CircleCheck,
		tone: "text-[var(--success)] bg-[var(--success-tint)]",
	},
	failed: { icon: CircleX, tone: "text-destructive bg-destructive/10" },
	cancelled: { icon: CircleX, tone: "text-muted-foreground bg-muted/60" },
};
export function TaskStatusBadge({
	status,
	className,
}: {
	status: TaskStatus;
	className?: string;
}) {
	const { t } = useTranslation();
	const { icon: Icon, tone, spin } = appearance[status];
	return (
		<span
			data-task-status={status}
			className={cn(
				"inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-5",
				tone,
				className,
			)}
		>
			<Icon
				aria-hidden
				className={cn("size-3", spin && "motion-safe:animate-spin")}
			/>
			{t(`agentTasks.status.${status}`)}
		</span>
	);
}
