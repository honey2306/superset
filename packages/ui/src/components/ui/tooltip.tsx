"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type * as React from "react";

import { cn } from "../../lib/utils";

function TooltipProvider({
	delayDuration = 0,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
	return (
		<TooltipPrimitive.Provider
			data-slot="tooltip-provider"
			delayDuration={delayDuration}
			{...props}
		/>
	);
}

function Tooltip({
	delayDuration,
	disableHoverableContent,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Root> & {
	delayDuration?: number;
	disableHoverableContent?: boolean;
}) {
	return (
		<TooltipProvider
			delayDuration={delayDuration}
			disableHoverableContent={disableHoverableContent}
		>
			<TooltipPrimitive.Root data-slot="tooltip" {...props} />
		</TooltipProvider>
	);
}

function TooltipTrigger({
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
	return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
	className,
	sideOffset = 0,
	children,
	showArrow = true,
	arrowClassName,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & {
	showArrow?: boolean;
	arrowClassName?: string;
}) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				data-slot="tooltip-content"
				sideOffset={sideOffset}
				className={cn(
					// DS Tooltip: sunk-surface bg (not foreground!), hairline border,
					// shadow-2, 6px radius, dur-quick enter. Reserved for one-line
					// factual labels; disabled-item reasons go here, longer content
					// belongs in Popover.
					"bg-surface-sunk text-fg border border-line animate-in fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 z-tooltip w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) rounded-ds-3 px-2.5 py-1 text-[11px] text-balance break-words shadow-ds-2",
					className,
				)}
				{...props}
			>
				{children}
				{showArrow && (
					<TooltipPrimitive.Arrow
						className={cn(
							"fill-surface-sunk z-50 size-2 translate-y-[calc(-50%_-_1px)] rotate-45",
							arrowClassName,
						)}
					/>
				)}
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
