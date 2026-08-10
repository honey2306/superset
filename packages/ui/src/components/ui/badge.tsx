import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

// DS Badge: two visual families —
//   `default`/`secondary` = neutral capsule (--surface-elev + hairline)
//   `destructive` = danger-tint + danger fg
//   `outline` = pure hairline pill, no fill
//   `box` = uppercase mono pill in accent-tint (workspace status markers)
// Numeric/code content should stay mono at the call site; badges are for
// short glyph-y labels.
const badgeVariants = cva(
	"inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[10px] font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-[3px] focus-visible:ring-accent-tint aria-invalid:ring-destructive/25 aria-invalid:border-destructive transition-[color,background-color,box-shadow] duration-[120ms] overflow-hidden",
	{
		variants: {
			variant: {
				default:
					"border-line bg-surface-elev text-fg-mute [a&]:hover:bg-hover [a&]:hover:text-fg",
				secondary:
					"border-transparent bg-hover text-fg-mute [a&]:hover:bg-line-strong",
				destructive:
					"border-[color:var(--danger-line,transparent)] bg-danger-tint text-danger [a&]:hover:bg-danger/25",
				outline:
					"border-line-strong bg-transparent text-fg [a&]:hover:bg-hover",
				box: "rounded-ds-2 border-accent-line/40 bg-accent-tint text-accent-foreground text-[9.5px] uppercase tracking-[0.14em] px-1.5 py-0 font-semibold",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Badge({
	className,
	variant,
	asChild = false,
	...props
}: React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : "span";

	return (
		<Comp
			data-slot="badge"
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
