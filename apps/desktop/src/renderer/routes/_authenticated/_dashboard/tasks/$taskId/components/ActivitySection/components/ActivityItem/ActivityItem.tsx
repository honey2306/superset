import { formatDistanceToNow } from "date-fns";

interface ActivityItemProps {
	avatarUrl?: string | null;
	avatarFallback: string;
	actorName: string;
	action: string;
	timestamp: Date;
}

export function ActivityItem({
	avatarUrl,
	avatarFallback,
	actorName,
	action,
	timestamp,
}: ActivityItemProps) {
	return (
		<div className="flex items-start gap-3">
			{avatarUrl ? (
				<img
					src={avatarUrl}
					alt=""
					className="w-6 h-6 rounded-full shrink-0 mt-0.5"
				/>
			) : (
				<div className="w-6 h-6 rounded-full bg-hover flex items-center justify-center text-xs shrink-0 mt-0.5">
					{avatarFallback}
				</div>
			)}
			<div className="text-sm">
				<span className="text-fg">{actorName}</span>
				<span className="text-fg-mute">
					{" "}
					{action} · {formatDistanceToNow(timestamp, { addSuffix: true })}
				</span>
			</div>
		</div>
	);
}
