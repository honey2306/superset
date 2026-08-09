"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Checkbox({
	className,
	...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				// DS Checkbox: 14px square, 1.5px line-strong border, r-2.
				// Checked = pink-tint bg + pink foreground checkmark. Pair with
				// forms/Label for clickable labels. `Radio` is the mutex sibling.
				"peer bg-transparent border-[1.5px] border-line-strong data-[state=checked]:bg-accent data-[state=checked]:border-accent-line data-[state=checked]:text-accent-solid focus-visible:ring-[3px] focus-visible:ring-accent-tint aria-invalid:ring-destructive/25 aria-invalid:border-destructive size-[14px] shrink-0 rounded-ds-2 transition-[background-color,border-color,box-shadow] duration-[120ms] outline-none disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-current transition-none"
			>
				<CheckIcon className="size-3" strokeWidth={2.6} />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
