import type * as React from "react";

import { cn } from "../../lib/utils";

/**
 * DS Input: hairline border on --surface-elev, 8px radius, 30px tall.
 * Focus fires the DS pink glow ring instead of the browser default blue.
 * `ghost` reads as "in-place editing" — transparent, single bottom hairline,
 * pink under-line on focus.
 */
const inputVariants = {
	default: [
		"file:text-foreground placeholder:text-fg-faint selection:bg-accent selection:text-accent-foreground border-line bg-surface-elev h-[30px] w-full min-w-0 rounded-ds-4 border px-3 py-1 text-xs transition-[border-color,box-shadow,background-color] duration-[120ms] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
		"focus-visible:border-accent-line focus-visible:ring-[3px] focus-visible:ring-accent-tint",
		"aria-invalid:ring-destructive/25 aria-invalid:border-destructive",
	],
	ghost: [
		"bg-transparent border-0 border-b border-line rounded-none outline-none text-xs h-[26px] w-full min-w-0 px-0 text-fg placeholder:text-fg-faint transition-[border-color] duration-[120ms]",
		"focus-visible:border-accent-line",
	],
};

interface InputProps extends React.ComponentProps<"input"> {
	variant?: keyof typeof inputVariants;
}

function Input({ className, type, variant = "default", ...props }: InputProps) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(inputVariants[variant], className)}
			{...props}
		/>
	);
}

export { Input };
