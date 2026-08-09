import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

// DS Alert: 4 tones read from tint / border / icon color triples.
// Persistent inline banner — for transient success/error prefer `Toast`,
// for whole-surface takeover use the ErrorState pattern.
const alertVariants = cva(
	"relative w-full rounded-ds-4 border px-4 py-3 text-[12px] leading-[var(--lh-body)] grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-0.5 items-start [&>svg]:size-3.5 [&>svg]:translate-y-0.5 [&>svg]:text-current",
	{
		variants: {
			variant: {
				default: "bg-surface-sunk text-fg border-line [&>svg]:text-fg-mute",
				info: "bg-info-tint text-fg border-[color:color-mix(in_oklch,var(--info)_22%,transparent)] [&>svg]:text-info",
				success:
					"bg-success-tint text-fg border-[color:color-mix(in_oklch,var(--success)_22%,transparent)] [&>svg]:text-success",
				warning:
					"bg-warning-tint text-fg border-[color:color-mix(in_oklch,var(--warning)_22%,transparent)] [&>svg]:text-warning",
				destructive:
					"bg-danger-tint text-fg border-[color:color-mix(in_oklch,var(--danger)_25%,transparent)] [&>svg]:text-destructive *:data-[slot=alert-description]:text-fg-mute",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Alert({
	className,
	variant,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
	return (
		<div
			data-slot="alert"
			role="alert"
			className={cn(alertVariants({ variant }), className)}
			{...props}
		/>
	);
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-title"
			className={cn(
				"col-start-2 line-clamp-1 min-h-4 font-semibold text-[12px] tracking-[var(--ls-title)]",
				className,
			)}
			{...props}
		/>
	);
}

function AlertDescription({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-description"
			className={cn(
				"text-fg-mute col-start-2 grid justify-items-start gap-1 text-[12px] [&_p]:leading-[var(--lh-body)]",
				className,
			)}
			{...props}
		/>
	);
}

export { Alert, AlertTitle, AlertDescription };
