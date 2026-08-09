import { cn } from "../../lib/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
	return (
		<kbd
			data-slot="kbd"
			className={cn(
				// DS Kbd: raised chip on --surface-elev with hairline, mono,
				// tight letter-spacing. Used inline in menu items, tooltip
				// hints, and KeyboardHintBar.
				"bg-surface-elev text-fg-faint border border-line pointer-events-none inline-flex h-[16px] w-fit min-w-[16px] items-center justify-center gap-1 rounded-ds-2 px-[5px] font-mono text-[10px] leading-none tracking-[var(--ls-mono)] select-none",
				"[&_svg:not([class*='size-'])]:size-3",
				"[[data-slot=tooltip-content]_&]:bg-hover [[data-slot=tooltip-content]_&]:text-fg [[data-slot=tooltip-content]_&]:border-line-strong",
				className,
			)}
			{...props}
		/>
	);
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<kbd
			data-slot="kbd-group"
			className={cn("inline-flex items-center gap-1", className)}
			{...props}
		/>
	);
}

export { Kbd, KbdGroup };
