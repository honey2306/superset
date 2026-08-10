import { HiOutlineComputerDesktop, HiOutlineSignal } from "react-icons/hi2";

export function RemoteWorkspacesDemo() {
	return (
		<div className="w-full h-full flex items-center justify-center">
			<div className="w-[300px] bg-surface/90 backdrop-blur-sm rounded-ds-5 border border-line shadow-2xl overflow-hidden">
				<div className="flex items-center justify-between px-4 py-3 bg-hover/80 border-b border-line/50">
					<div className="flex items-center gap-2">
						<div className="flex gap-1.5">
							<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
						</div>
						<span className="text-xs text-fg-mute ml-1">Remote Workspaces</span>
					</div>
				</div>

				<div className="p-4">
					<div className="flex items-center justify-center gap-3 py-3">
						<div className="flex flex-col items-center gap-1.5">
							<div className="w-10 h-10 rounded-ds-5 bg-fg/10 flex items-center justify-center">
								<HiOutlineComputerDesktop className="size-5 text-fg-mute" />
							</div>
							<span className="text-[10px] text-fg-mute">This Mac</span>
						</div>
						<div className="flex items-center gap-1">
							<div className="w-6 h-px bg-fg/20" />
							<HiOutlineSignal className="size-4 text-pink-400 animate-pulse" />
							<div className="w-6 h-px bg-fg/20" />
						</div>
						<div className="flex flex-col items-center gap-1.5">
							<div className="w-10 h-10 rounded-ds-5 bg-fg/10 flex items-center justify-center">
								<HiOutlineComputerDesktop className="size-5 text-fg-mute" />
							</div>
							<span className="text-[10px] text-fg-mute">Remote</span>
						</div>
					</div>

					<div className="mt-2 space-y-1.5">
						<div className="flex items-center justify-between px-2 py-1.5 rounded bg-fg/5 text-xs">
							<span className="text-fg-mute">Tunnel established</span>
							<span className="text-success text-[10px]">live</span>
						</div>
						<div className="flex items-center justify-between px-2 py-1.5 rounded bg-fg/5 text-xs">
							<span className="text-fg-mute">Latency</span>
							<span className="text-fg-mute text-[10px]">42ms</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
