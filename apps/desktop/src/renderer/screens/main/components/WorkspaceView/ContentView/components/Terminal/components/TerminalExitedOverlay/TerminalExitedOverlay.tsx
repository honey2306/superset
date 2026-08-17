import { Button } from "@superset/ui/button";
import { Card } from "@superset/ui/card";
import { LuPower } from "react-icons/lu";

interface TerminalExitedOverlayProps {
	exitCode: number;
	isRestarting: boolean;
	onRestart: () => void;
}

export function TerminalExitedOverlay({
	exitCode,
	isRestarting,
	onRestart,
}: TerminalExitedOverlayProps) {
	return (
		<div className="absolute inset-0 z-10 flex items-center justify-center bg-[color:var(--overlay-scrim,rgba(0,0,0,0.42))]">
			<Card className="gap-3 px-2 py-4">
				<div className="flex flex-col items-center gap-1.5 px-4 text-center">
					<LuPower className="size-5 text-fg-mute" />
					<p className="text-sm font-medium">Terminal exited</p>
					<p className="text-xs text-fg-mute">
						Process exited with code {exitCode}.
					</p>
				</div>
				<div className="px-4">
					<Button
						size="sm"
						className="w-full"
						disabled={isRestarting}
						onClick={onRestart}
					>
						{isRestarting ? "Restarting…" : "Restart terminal"}
					</Button>
				</div>
			</Card>
		</div>
	);
}
