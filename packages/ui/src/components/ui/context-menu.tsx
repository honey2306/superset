"use client";

import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../../lib/utils";

function ContextMenu({
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
	return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuTrigger({
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
	return (
		<ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
	);
}

function ContextMenuGroup({
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
	return (
		<ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
	);
}

function ContextMenuPortal({
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
	return (
		<ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
	);
}

function ContextMenuSub({
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
	return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />;
}

function ContextMenuRadioGroup({
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
	return (
		<ContextMenuPrimitive.RadioGroup
			data-slot="context-menu-radio-group"
			{...props}
		/>
	);
}

function ContextMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
	inset?: boolean;
}) {
	return (
		<ContextMenuPrimitive.SubTrigger
			data-slot="context-menu-sub-trigger"
			data-inset={inset}
			className={cn(
				"focus:bg-hover focus:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg [&_svg:not([class*='text-'])]:text-fg-mute flex h-[30px] cursor-default items-center gap-2.5 rounded-ds-3 px-2.5 text-xs outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 transition-colors duration-[80ms]",
				className,
			)}
			{...props}
		>
			{children}
			<ChevronRightIcon className="ml-auto" />
		</ContextMenuPrimitive.SubTrigger>
	);
}

function ContextMenuSubContent({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
	return (
		<ContextMenuPrimitive.SubContent
			data-slot="context-menu-sub-content"
			className={cn(
				"bg-popover/95 backdrop-blur-[6px] text-popover-foreground border border-line data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 z-overlay min-w-[220px] origin-(--radix-context-menu-content-transform-origin) overflow-hidden rounded-ds-5 p-1 shadow-ds-3",
				className,
			)}
			{...props}
		/>
	);
}

function ContextMenuContent({
	className,
	ref,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
	// Wayland delivers a stray pointerup with the opening `contextmenu`,
	// landing on the just-mounted item under the cursor. Radix's MenuItem
	// treats pointerup with no prior pointerdown as a drag-release and calls
	// `event.currentTarget?.click()` → onSelect, so opening the menu fires
	// whatever item sits under the cursor (usually destructive Close Pane).
	// Intercept pointerup, not mouseup — mouseup arrives too late. Reset per
	// event so the guard re-arms for force-mounted content. Callback ref
	// (not useEffect): Portal renders its child only when open, so useEffect
	// on the wrapper would see a null ref. See superset-sh/superset#4939.
	const forwardedRef = React.useRef(ref);
	forwardedRef.current = ref;
	const cleanupRef = React.useRef<(() => void) | null>(null);
	const setRef = React.useCallback((node: HTMLDivElement | null) => {
		cleanupRef.current?.();
		cleanupRef.current = null;
		const forwarded = forwardedRef.current;
		if (typeof forwarded === "function") forwarded(node);
		else if (forwarded) forwarded.current = node;
		if (!node) return;
		let sawPointerDown = false;
		const onDown = () => {
			sawPointerDown = true;
		};
		const onUp = (event: PointerEvent) => {
			if (!sawPointerDown) {
				event.stopPropagation();
				event.preventDefault();
			}
			sawPointerDown = false;
		};
		node.addEventListener("pointerdown", onDown, true);
		node.addEventListener("pointerup", onUp, true);
		cleanupRef.current = () => {
			node.removeEventListener("pointerdown", onDown, true);
			node.removeEventListener("pointerup", onUp, true);
		};
	}, []);

	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Content
				ref={setRef}
				data-slot="context-menu-content"
				className={cn(
					// DS ContextMenu — the whole reason v3 exists: right-click
					// aggregation of row actions. Matches DropdownMenu density
					// (10px radius, shadow-3, backdrop blur 6px, 30px rows).
					"bg-popover/95 backdrop-blur-[6px] text-popover-foreground border border-line data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 z-overlay max-h-(--radix-context-menu-content-available-height) min-w-[220px] origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-ds-5 p-1 shadow-ds-3",
					className,
				)}
				{...props}
			/>
		</ContextMenuPrimitive.Portal>
	);
}

function ContextMenuItem({
	className,
	inset,
	variant = "default",
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
	inset?: boolean;
	variant?: "default" | "destructive";
}) {
	return (
		<ContextMenuPrimitive.Item
			data-slot="context-menu-item"
			data-inset={inset}
			data-variant={variant}
			className={cn(
				"focus:bg-hover focus:text-fg data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/12 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-fg-mute relative flex h-[30px] cursor-default items-center gap-2.5 rounded-ds-3 px-2.5 text-xs outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 transition-colors duration-[80ms]",
				className,
			)}
			{...props}
		/>
	);
}

function ContextMenuCheckboxItem({
	className,
	children,
	checked,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
	return (
		<ContextMenuPrimitive.CheckboxItem
			data-slot="context-menu-checkbox-item"
			className={cn(
				"focus:bg-hover focus:text-fg relative flex h-[30px] cursor-default items-center gap-2.5 rounded-ds-3 py-0 pr-2.5 pl-8 text-xs outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 transition-colors duration-[80ms]",
				className,
			)}
			checked={checked}
			{...props}
		>
			<span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
				<ContextMenuPrimitive.ItemIndicator>
					<CheckIcon className="size-4" />
				</ContextMenuPrimitive.ItemIndicator>
			</span>
			{children}
		</ContextMenuPrimitive.CheckboxItem>
	);
}

function ContextMenuRadioItem({
	className,
	children,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem>) {
	return (
		<ContextMenuPrimitive.RadioItem
			data-slot="context-menu-radio-item"
			className={cn(
				"focus:bg-hover focus:text-fg relative flex h-[30px] cursor-default items-center gap-2.5 rounded-ds-3 py-0 pr-2.5 pl-8 text-xs outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 transition-colors duration-[80ms]",
				className,
			)}
			{...props}
		>
			<span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
				<ContextMenuPrimitive.ItemIndicator>
					<CircleIcon className="size-2 fill-current" />
				</ContextMenuPrimitive.ItemIndicator>
			</span>
			{children}
		</ContextMenuPrimitive.RadioItem>
	);
}

function ContextMenuLabel({
	className,
	inset,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
	inset?: boolean;
}) {
	return (
		<ContextMenuPrimitive.Label
			data-slot="context-menu-label"
			data-inset={inset}
			className={cn(
				"text-fg-faint px-2.5 pt-2.5 pb-1 text-[10px] font-medium uppercase tracking-[0.16em] data-[inset]:pl-8",
				className,
			)}
			{...props}
		/>
	);
}

function ContextMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
	return (
		<ContextMenuPrimitive.Separator
			data-slot="context-menu-separator"
			className={cn("bg-line -mx-1 my-1 h-px", className)}
			{...props}
		/>
	);
}

function ContextMenuShortcut({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="context-menu-shortcut"
			className={cn(
				"text-fg-faint ml-auto text-[10px] font-mono tracking-[var(--ls-mono)]",
				className,
			)}
			{...props}
		/>
	);
}

export {
	ContextMenu,
	ContextMenuTrigger,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuCheckboxItem,
	ContextMenuRadioItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuGroup,
	ContextMenuPortal,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuRadioGroup,
};
