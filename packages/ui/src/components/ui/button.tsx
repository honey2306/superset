import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

/**
 * Buttons follow the DS contract at
 * designs/superset-design-system/readme.md → Components → Button:
 *   - Pill radius by default (r-pill). Non-pill variants opt out with `size`.
 *   - `default` reads as a neutral pill; hover adds `--hover`.
 *   - `primary` sits on `--accent-tint` (pink 14%) with a full-pink foreground
 *     — the *only* place a pink surface reads as brand fill.
 *   - `ghost` drops the border; `outline` keeps it but stays neutral.
 *   - `destructive` is danger-tint + full danger foreground (mirrors primary).
 *   - Focus is the DS accent glow ring, never browser blue.
 * Sizes follow the DS density (default 28px, sm 24px, lg 32px), not shadcn's
 * 36/32/40 web-tempo scale.
 */
const buttonVariants = cva(
	"inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-xs font-medium transition-[background-color,border-color,color,box-shadow] duration-[120ms] ease-[cubic-bezier(0.2,0.7,0.3,1)] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-[3px] focus-visible:ring-accent-tint aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
	{
		variants: {
			variant: {
				default:
					"border border-line-strong text-fg hover:bg-hover hover:border-line-strong",
				primary:
					"border border-accent-line bg-accent text-accent-foreground hover:bg-accent-tint",
				destructive:
					"border border-danger/55 bg-danger-tint text-danger hover:bg-danger/25",
				outline:
					"border border-line text-fg-mute hover:text-fg hover:bg-hover",
				secondary:
					"border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
				ghost:
					"border border-transparent text-fg-mute hover:text-fg hover:bg-hover",
				link: "text-accent-solid underline-offset-4 hover:underline rounded-none",
			},
			size: {
				default: "h-7 px-3.5",
				xs: "h-5 px-2 text-[10.5px] gap-1 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-6 px-3 text-[11px] [&_svg:not([class*='size-'])]:size-3",
				lg: "h-8 px-5 text-[13px] [&_svg:not([class*='size-'])]:size-4",
				icon: "size-7",
				"icon-sm": "size-6",
				"icon-xs": "size-5",
				"icon-lg": "size-8",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
