"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { CircleIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "../../lib/utils";

function RadioGroup({
	className,
	...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
	return (
		<RadioGroupPrimitive.Root
			data-slot="radio-group"
			className={cn("grid gap-3", className)}
			{...props}
		/>
	);
}

function RadioGroupItem({
	className,
	...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
	return (
		<RadioGroupPrimitive.Item
			data-slot="radio-group-item"
			className={cn(
				// DS Radio: 14px pill, 1.5px line-strong ring, hover reveals
				// accent line. Checked = accent inner dot (not full fill).
				"border-[1.5px] border-line-strong bg-transparent hover:border-[color:color-mix(in_oklch,var(--accent)_60%,var(--line-strong))] focus-visible:ring-[3px] focus-visible:ring-accent-tint aria-invalid:ring-destructive/25 aria-invalid:border-destructive aspect-square size-[14px] shrink-0 rounded-full transition-[border-color,box-shadow] duration-[120ms] outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-accent-line",
				className,
			)}
			{...props}
		>
			<RadioGroupPrimitive.Indicator
				data-slot="radio-group-indicator"
				className="relative flex items-center justify-center"
			>
				<CircleIcon className="fill-accent-solid absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 stroke-0" />
			</RadioGroupPrimitive.Indicator>
		</RadioGroupPrimitive.Item>
	);
}

export { RadioGroup, RadioGroupItem };
