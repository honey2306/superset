"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Tabs({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			className={cn("flex flex-col gap-2", className)}
			{...props}
		/>
	);
}

function TabsList({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			className={cn(
				// DS Tabs: bottom-hairline row, NOT a pill segmented control.
				// (That's SegmentedControl.) Height 34, gap 8, hairline separator
				// below via ::after in TabsTrigger's active state.
				"inline-flex h-[34px] w-fit items-center gap-1 border-b border-line",
				className,
			)}
			{...props}
		/>
	);
}

function TabsTrigger({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
	return (
		<TabsPrimitive.Trigger
			data-slot="tabs-trigger"
			className={cn(
				// DS Tab: underline-only. Muted text default → --fg on active +
				// 2px pink underline flush against the hairline. Hover reveals
				// --fg without a bg. Focus fires the DS accent glow.
				"relative inline-flex h-[calc(100%-1px)] items-center gap-1.5 px-3 pb-2 pt-2 text-[12px] font-medium whitespace-nowrap text-fg-mute hover:text-fg transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent-tint disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-fg data-[state=active]:after:content-[''] data-[state=active]:after:absolute data-[state=active]:after:inset-x-0 data-[state=active]:after:-bottom-[1px] data-[state=active]:after:h-[2px] data-[state=active]:after:bg-accent-solid data-[state=active]:after:rounded-[2px_2px_0_0] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({
	className,
	...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
	return (
		<TabsPrimitive.Content
			data-slot="tabs-content"
			className={cn("flex-1 outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
