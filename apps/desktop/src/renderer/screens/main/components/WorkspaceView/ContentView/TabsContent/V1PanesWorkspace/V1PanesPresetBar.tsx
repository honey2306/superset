import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	AGENT_TYPES,
} from "@superset/shared/agent-command";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuPlus } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { usePresets } from "renderer/react-query/presets";
import type { V1PanesPresetOpeners } from "./useV1PanesPresetOpeners";

/**
 * A minimal agent-preset launch bar for the v1-panes mount.
 *
 * M1 replaced `GroupStrip + PresetsBar + TabsContent` wholesale with
 * `<V1PanesWorkspace>`, which dropped one-click agent preset launch (the
 * M1 "UX regression to track"). This bar restores it under the flag: it
 * renders the project's pinned presets (the same `usePresets` feed v1's
 * `PresetsBar` reads) plus the built-in agent quick-add templates, and
 * launches them into the panes store via the injected
 * `useV1PanesPresetOpeners`.
 *
 * Scope: single-pane terminal launch only. The v1 `PresetsBar`'s pin /
 * reorder / manage / right-click multi-target menu are a fidelity
 * follow-up (M7 merges the full `PresetsBar` onto the panes base). This
 * bar is the daily-driver minimum: click an agent → it opens a terminal
 * running that agent.
 */
export function V1PanesPresetBar({
	workspaceId,
	openers,
}: {
	workspaceId: string;
	openers: V1PanesPresetOpeners;
}) {
	const isDark = useIsDarkTheme();
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId },
		{ enabled: !!workspaceId },
	);
	const { matchedPresets, createPreset } = usePresets(workspace?.projectId);

	const pinnedPresets = matchedPresets.filter((p) => p.pinnedToBar !== false);

	return (
		<div
			className="flex h-8 items-center gap-0.5 border-b border-border bg-background px-2 shrink-0 overflow-x-auto"
			style={{ scrollbarWidth: "none" }}
		>
			{pinnedPresets.map((preset) => {
				const icon = getPresetIcon(preset.name, isDark);
				return (
					<Tooltip key={preset.id} delayDuration={1000}>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="h-6 shrink-0 gap-1.5 px-2"
								onClick={() => {
									void openers.openPreset(preset, { target: "new-tab" });
								}}
							>
								{icon ? (
									<img src={icon} alt="" className="size-3.5 object-contain" />
								) : null}
								<span className="text-xs truncate max-w-24">
									{preset.name || "default"}
								</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom" showArrow={false}>
							{preset.description || preset.name}
						</TooltipContent>
					</Tooltip>
				);
			})}

			{/* Quick-add agent templates (claude/amp/codex/…): create the preset
			     on first click, then it appears in the pinned row above. */}
			<DropdownMenu>
				<Tooltip delayDuration={1000}>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="size-6 shrink-0">
								<LuPlus className="size-3.5" />
							</Button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Add agent preset
					</TooltipContent>
				</Tooltip>
				<DropdownMenuContent align="start" className="w-56">
					{AGENT_TYPES.map((agent) => {
						const icon = getPresetIcon(agent, isDark);
						return (
							<DropdownMenuItem
								key={agent}
								disabled={createPreset.isPending}
								onSelect={(event) => {
									event.preventDefault();
									createPreset.mutate({
										name: agent,
										description: AGENT_PRESET_DESCRIPTIONS[agent],
										cwd: "",
										commands: AGENT_PRESET_COMMANDS[agent],
										pinnedToBar: true,
									});
								}}
							>
								{icon ? (
									<img src={icon} alt="" className="size-4 object-contain" />
								) : null}
								<span className="truncate">{agent}</span>
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
