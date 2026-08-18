import { cn } from "@superset/ui/utils";
import { useEffect, useMemo, useRef } from "react";
import { useDragLayer } from "react-dnd";
import { useStore } from "zustand";
import type { Pane } from "../../../types";
import type { WorkspaceProps } from "../../types";
import { Tab } from "./components/Tab";
import { TabBar } from "./components/TabBar";
import { TAB_DRAG_TYPE } from "./components/TabBar/components/TabItem";
import { useWorkspaceInteractionState } from "./hooks/useWorkspaceInteractionState";

export function Workspace<TData>({
	store,
	registry,
	isActive = true,
	className,
	renderTabAccessory,
	renderTabIcon,
	renderEmptyState,
	renderAddTabMenu,
	onAddTab,
	renderTabBarTrailing,
	renderBelowTabBar,
	onBeforeCloseTab,
	onAfterCloseTab,
	onInteractionStateChange,
	paneActions,
	contextMenuActions,
}: WorkspaceProps<TData>) {
	const tabs = useStore(store, (s) => s.tabs);
	const activeTabId = useStore(store, (s) => s.activeTabId);
	const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
	const { onSplitResizeDragging } = useWorkspaceInteractionState({
		onInteractionStateChange,
	});

	// The tab id currently being dragged in the tab bar, if any.
	const draggedTabId = useDragLayer((monitor) => {
		if (!monitor.isDragging() || monitor.getItemType() !== TAB_DRAG_TYPE) {
			return null;
		}
		const item = monitor.getItem() as { tabId?: string } | null;
		return item?.tabId ?? null;
	});

	// While dragging the active tab, render its neighbor (preceding tab, or the
	// next one when dragging the first tab) instead. Dropping a tab onto its own
	// view is a no-op (you'd merge it into itself), so showing a sibling lets
	// you see — and drop onto — an actual merge target.
	const displayedTab = useMemo(() => {
		if (draggedTabId && draggedTabId === activeTabId) {
			const index = tabs.findIndex((t) => t.id === draggedTabId);
			if (index > 0) return tabs[index - 1];
			if (index === 0 && tabs.length > 1) return tabs[1];
		}
		return activeTab;
	}, [draggedTabId, activeTabId, tabs, activeTab]);

	// Lazily mount each tab on first visit, then keep it mounted so switching
	// tabs preserves terminal attachments, session subscriptions, scroll, and
	// component-local state. Tabs that have never been visited pay no startup
	// cost.
	const visitedTabIdsRef = useRef(new Set<string>());
	const visitedStoreRef = useRef(store);
	if (visitedStoreRef.current !== store) {
		visitedStoreRef.current = store;
		visitedTabIdsRef.current.clear();
	}
	if (displayedTab) visitedTabIdsRef.current.add(displayedTab.id);
	const currentTabIds = new Set(tabs.map((tab) => tab.id));
	for (const tabId of visitedTabIdsRef.current) {
		if (!currentTabIds.has(tabId)) visitedTabIdsRef.current.delete(tabId);
	}

	const previousPanesRef = useRef<Map<string, Pane<TData>>>(new Map());
	const previousStoreRef = useRef(store);
	// A workspace switch supplies a different store. Its panes did not close;
	// they merely belong to the previous workspace and must not run
	// `onAfterClose` (which can kill an otherwise live terminal session).
	if (previousStoreRef.current !== store) {
		previousStoreRef.current = store;
		previousPanesRef.current = new Map();
	}
	useEffect(() => {
		const current = new Map<string, Pane<TData>>();
		for (const tab of tabs) {
			for (const pane of Object.values(tab.panes)) {
				current.set(pane.id, pane);
			}
		}
		for (const [prevId, prevPane] of previousPanesRef.current) {
			if (!current.has(prevId)) {
				registry[prevPane.kind]?.onAfterClose?.(prevPane);
			}
		}
		previousPanesRef.current = current;
	}, [tabs, registry]);

	const closeTab = async (tabId: string) => {
		const tab = store.getState().getTab(tabId);
		if (!tab) return;
		if (onBeforeCloseTab) {
			const allowed = await onBeforeCloseTab(tab);
			if (!allowed) return;
		}
		// Re-check after the await: the tab may have been removed concurrently.
		if (!store.getState().getTab(tabId)) return;
		store.getState().removeTab(tabId);
		try {
			onAfterCloseTab?.(tab);
		} catch (err) {
			console.error("onAfterCloseTab threw", err);
		}
	};

	return (
		<div
			className={cn(
				"flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground",
				className,
			)}
		>
			<TabBar
				tabs={tabs}
				registry={registry}
				activeTabId={activeTabId}
				onSelectTab={(tabId) => store.getState().setActiveTab(tabId)}
				onCloseTab={closeTab}
				onCloseOtherTabs={async (tabId) => {
					for (const tab of tabs) {
						if (tab.id !== tabId) await closeTab(tab.id);
					}
				}}
				onCloseAllTabs={async () => {
					for (const tab of tabs) {
						await closeTab(tab.id);
					}
				}}
				onRenameTab={(tabId, title) =>
					store.getState().setTabTitleOverride({ tabId, titleOverride: title })
				}
				onReorderTab={(tabId, toIndex) =>
					store.getState().reorderTab({ tabId, toIndex })
				}
				onMovePaneToNewTab={(paneId, toIndex) =>
					store.getState().movePaneToNewTab({ paneId, toIndex })
				}
				renderTabIcon={renderTabIcon}
				renderAddTabMenu={renderAddTabMenu}
				onAddTab={onAddTab}
				renderTabBarTrailing={renderTabBarTrailing}
				renderTabAccessory={renderTabAccessory}
			/>
			{renderBelowTabBar?.()}
			{tabs.length > 0 ? (
				<div className="flex min-h-0 min-w-0 flex-1">
					{tabs.map((tab) => {
						if (!visitedTabIdsRef.current.has(tab.id)) return null;
						const isDisplayed = tab.id === displayedTab?.id;
						return (
							<div
								key={tab.id}
								data-pane-tab-content={tab.id}
								aria-hidden={!isDisplayed}
								className={cn(
									"min-h-0 min-w-0 flex-1",
									!isDisplayed && "hidden",
								)}
							>
								<Tab
									store={store}
									tab={tab}
									isActive={isActive && isDisplayed}
									registry={registry}
									paneActions={paneActions}
									contextMenuActions={contextMenuActions}
									onSplitResizeDragging={onSplitResizeDragging}
								/>
							</div>
						);
					})}
				</div>
			) : (
				<div className="flex min-h-0 min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
					{renderEmptyState?.() ?? "No tabs open"}
				</div>
			)}
		</div>
	);
}
