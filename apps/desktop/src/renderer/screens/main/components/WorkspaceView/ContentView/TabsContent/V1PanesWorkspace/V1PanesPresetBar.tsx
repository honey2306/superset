import type { WorkspaceStore } from "@superset/panes";
import {
	AGENT_PRESET_COMMANDS,
	AGENT_PRESET_DESCRIPTIONS,
	type AgentType,
} from "@superset/shared/agent-command";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiMiniCog6Tooth } from "react-icons/hi2";
import { LuPlus } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { usePresets } from "renderer/react-query/presets";
import { useCatalogWorkspace } from "renderer/routes/_authenticated/providers/WorkspaceCatalogProvider/selectors";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import { V1PanesPresetBarItem } from "./components/V1PanesPresetBarItem";
import {
	canCreateV1PanesAgentPreset,
	getAvailableV1PanesAgentTypes,
} from "./getAvailableV1PanesAgentTypes";
import { openV1PanesPresetFromBar } from "./openV1PanesPresetFromBar";
import type { V1PanesPaneData } from "./types";
import type { V1PanesPresetOpeners } from "./useV1PanesPresetOpeners";
import { V1PanesWorkspaceRunButton } from "./V1PanesWorkspaceRunButton";
import {
	finishV1PresetDrag,
	getV1PinnedPresetIds,
	getV1PinnedPresetsForRender,
	getV1PresetReorderMutation,
	reorderV1PinnedPresetIds,
	syncV1PinnedPresetIds,
} from "./v1PanesPresetOrder";

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
 * Scope: preset launch, quick-add, and pinned preset drag reordering. Pin
 * management, settings, and the right-click multi-target menu remain outside
 * this V1 panes bar.
 */
export function V1PanesPresetBar({
	workspaceId,
	openers,
	store,
}: {
	workspaceId: string;
	openers: V1PanesPresetOpeners;
	store: StoreApi<WorkspaceStore<V1PanesPaneData>>;
}) {
	const navigate = useNavigate();
	const isDark = useIsDarkTheme();
	const canOpenInCurrentPane = useStore(
		store,
		(state) => state.getActivePane() !== null,
	);
	const { workspace } = useCatalogWorkspace(workspaceId);
	const { presets, matchedPresets, createPreset, reorderPresets } = usePresets(
		workspace?.projectId,
	);

	const inFlightAgentTypesRef = useRef(new Set<AgentType>());
	const isDraggingPresetRef = useRef(false);
	const [dragPresetSnapshot, setDragPresetSnapshot] = useState<
		typeof matchedPresets | null
	>(null);
	const dragStartPinnedPresetIdsRef = useRef<string[]>([]);
	const latestMatchedPresetsRef = useRef(matchedPresets);
	const [localPinnedPresetIds, setLocalPinnedPresetIds] = useState<string[]>(
		() => getV1PinnedPresetIds(matchedPresets),
	);
	const pinnedPresets = useMemo(
		() =>
			getV1PinnedPresetsForRender({
				localPinnedPresetIds,
				matchedPresets,
				dragSnapshot: dragPresetSnapshot,
			}),
		[dragPresetSnapshot, localPinnedPresetIds, matchedPresets],
	);
	const availableAgentTypes = getAvailableV1PanesAgentTypes(matchedPresets);

	useEffect(() => {
		latestMatchedPresetsRef.current = matchedPresets;
		setLocalPinnedPresetIds((currentIds) =>
			syncV1PinnedPresetIds(
				currentIds,
				matchedPresets,
				isDraggingPresetRef.current,
			),
		);
	}, [matchedPresets]);

	const handleOpenPreset = useCallback(
		(preset: (typeof matchedPresets)[number]) => {
			void openV1PanesPresetFromBar(openers, preset, "new-tab").catch(
				(error: unknown) =>
					console.error("[v1-panes] preset open failed", error),
			);
		},
		[openers],
	);
	const handleOpenPresetInCurrentPane = useCallback(
		(preset: (typeof matchedPresets)[number]) => {
			void openV1PanesPresetFromBar(openers, preset, "current-pane").catch(
				(error: unknown) =>
					console.error("[v1-panes] preset open failed", error),
			);
		},
		[openers],
	);
	const handleEditPreset = useCallback(
		(preset: (typeof matchedPresets)[number]) => {
			void navigate({
				to: "/settings/terminal",
				search: { editPresetId: preset.id },
			});
		},
		[navigate],
	);
	const handleDragStart = useCallback(() => {
		isDraggingPresetRef.current = true;
		setDragPresetSnapshot(matchedPresets);
		setLocalPinnedPresetIds((currentIds) => {
			dragStartPinnedPresetIdsRef.current = [...currentIds];
			return currentIds;
		});
	}, [matchedPresets]);
	const handleDragEnd = useCallback((didDrop: boolean) => {
		isDraggingPresetRef.current = false;
		setLocalPinnedPresetIds((currentIds) =>
			finishV1PresetDrag({
				localPinnedPresetIds: currentIds,
				matchedPresets: latestMatchedPresetsRef.current,
				didDrop,
			}),
		);
		setDragPresetSnapshot(null);
		dragStartPinnedPresetIdsRef.current = [];
	}, []);
	const handleLocalReorder = useCallback(
		(fromIndex: number, toIndex: number) => {
			setLocalPinnedPresetIds((currentIds) =>
				reorderV1PinnedPresetIds(currentIds, fromIndex, toIndex),
			);
		},
		[],
	);
	const handlePersistReorder = useCallback(
		(
			presetId: string,
			originalPinnedIndex: number,
			targetPinnedIndex: number,
		) => {
			const mutation = getV1PresetReorderMutation({
				presets,
				currentMatchedPinnedPresetIds: getV1PinnedPresetIds(
					latestMatchedPresetsRef.current,
				),
				pinnedPresetIds: localPinnedPresetIds,
				originalPinnedPresetIds: dragStartPinnedPresetIdsRef.current,
				presetId,
				originalPinnedIndex,
				targetPinnedIndex,
			});
			if (!mutation) {
				return false;
			}
			reorderPresets.mutate(mutation);
			return true;
		},
		[localPinnedPresetIds, presets, reorderPresets],
	);

	return (
		<div
			className="flex h-8 items-center gap-0.5 border-b border-line bg-background px-2 shrink-0 overflow-x-auto"
			style={{ scrollbarWidth: "none" }}
		>
			{pinnedPresets.map((preset, pinnedIndex) => (
				<V1PanesPresetBarItem
					key={preset.id}
					preset={preset}
					pinnedIndex={pinnedIndex}
					isDark={isDark}
					canOpenInCurrentPane={canOpenInCurrentPane}
					onOpen={handleOpenPreset}
					onOpenInNewTab={handleOpenPreset}
					onOpenInCurrentPane={handleOpenPresetInCurrentPane}
					onEdit={handleEditPreset}
					onDragStart={handleDragStart}
					onDragEnd={handleDragEnd}
					onLocalReorder={handleLocalReorder}
					onPersistReorder={handlePersistReorder}
				/>
			))}

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
					{availableAgentTypes.map((agent) => {
						const icon = getPresetIcon(agent, isDark);
						return (
							<DropdownMenuItem
								key={agent}
								disabled={createPreset.isPending}
								onSelect={(event) => {
									event.preventDefault();
									if (
										!canCreateV1PanesAgentPreset({
											agent,
											matchedPresets,
											isPending: createPreset.isPending,
											inFlightAgentTypes: inFlightAgentTypesRef.current,
										})
									) {
										return;
									}
									inFlightAgentTypesRef.current.add(agent);
									createPreset.mutate(
										{
											name: agent,
											description: AGENT_PRESET_DESCRIPTIONS[agent],
											cwd: "",
											commands: AGENT_PRESET_COMMANDS[agent],
											pinnedToBar: true,
										},
										{
											onSettled: () => {
												inFlightAgentTypesRef.current.delete(agent);
											},
										},
									);
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
			<Tooltip delayDuration={1000}>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="size-6 shrink-0"
						onClick={() => void navigate({ to: "/settings/terminal" })}
					>
						<HiMiniCog6Tooth className="size-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Manage presets
				</TooltipContent>
			</Tooltip>
			<div className="ml-auto flex shrink-0 items-center gap-1">
				<V1PanesWorkspaceRunButton
					store={store}
					workspaceId={workspaceId}
					worktreePath={workspace?.worktreePath}
				/>
			</div>
		</div>
	);
}
