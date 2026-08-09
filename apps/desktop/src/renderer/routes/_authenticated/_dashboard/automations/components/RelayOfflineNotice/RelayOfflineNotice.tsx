import { cn } from "@superset/ui/utils";
import { LuTriangleAlert } from "react-icons/lu";
import { useRelayHostTarget } from "../../hooks/useRelayHostTarget";

interface RelayOfflineNoticeProps {
	hostId: string | null;
	className?: string;
}

const WRAPPER_CLASS =
	"flex flex-wrap items-center gap-x-4 gap-y-2 rounded-ds-3 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-foreground/85 select-text cursor-text";

const ICON = (
	<LuTriangleAlert
		className="mt-0.5 size-3.5 shrink-0 text-amber-500"
		aria-hidden="true"
	/>
);

/**
 * Automations dispatch from the cloud through the relay, so even the local
 * device is unreachable until relay access is enabled in Settings > Security.
 * Renders nothing while connectivity is unknown (row not yet synced).
 */
export function RelayOfflineNotice({
	hostId,
	className,
}: RelayOfflineNoticeProps) {
	const { isLocal, remoteHost, localHostIsOnline } = useRelayHostTarget(hostId);

	if (isLocal) {
		if (localHostIsOnline !== false) return null;
		return (
			<div className={cn(WRAPPER_CLASS, className)}>
				<div className="flex min-w-[240px] flex-1 items-start gap-2">
					{ICON}
					<span>
						This device isn't connected to the Superset relay, so automation
						runs will be skipped.
					</span>
				</div>
			</div>
		);
	}

	if (!hostId || !remoteHost || remoteHost.isOnline) return null;
	return (
		<div className={cn(WRAPPER_CLASS, className)}>
			<div className="flex min-w-[240px] flex-1 items-start gap-2">
				{ICON}
				<span>
					<span className="font-medium">{remoteHost.name}</span> isn't connected
					to the Superset relay, so its runs will be skipped. Make sure relay
					access is enabled on that device.
				</span>
			</div>
		</div>
	);
}
