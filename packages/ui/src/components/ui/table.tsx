"use client";

import type * as React from "react";

import { cn } from "../../lib/utils";

function Table({
	className,
	containerClassName,
	...props
}: React.ComponentProps<"table"> & { containerClassName?: string }) {
	return (
		<div
			data-slot="table-container"
			className={cn("relative w-full overflow-x-auto", containerClassName)}
		>
			<table
				data-slot="table"
				className={cn("w-full caption-bottom text-sm", className)}
				{...props}
			/>
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			data-slot="table-header"
			className={cn("[&_tr]:border-b", className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return (
		<tbody
			data-slot="table-body"
			className={cn("[&_tr:last-child]:border-0", className)}
			{...props}
		/>
	);
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
	return (
		<tfoot
			data-slot="table-footer"
			className={cn(
				"bg-hover border-t border-line font-medium [&>tr]:last:border-b-0",
				className,
			)}
			{...props}
		/>
	);
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
	// DS Table: 30px row, hairline separators. Active/selected → accent-tint.
	return (
		<tr
			data-slot="table-row"
			className={cn(
				"hover:bg-hover data-[state=selected]:bg-accent-tint border-b border-line transition-colors duration-[120ms]",
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
	// DS thead: 10px eyebrow uppercase, --fg-faint, hairline bottom.
	return (
		<th
			data-slot="table-head"
			className={cn(
				"text-fg-faint h-8 px-2.5 text-left align-middle text-[10px] font-medium uppercase tracking-[var(--ls-eyebrow)] whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
	// DS tbody cell: 30px row (via py-2), 12px text. Numeric columns should
	// add `font-mono` at call site for tabular reading.
	return (
		<td
			data-slot="table-cell"
			className={cn(
				"px-2.5 py-2 align-middle text-[12px] whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
				className,
			)}
			{...props}
		/>
	);
}

function TableCaption({
	className,
	...props
}: React.ComponentProps<"caption">) {
	return (
		<caption
			data-slot="table-caption"
			className={cn("text-fg-faint mt-3 text-[11px]", className)}
			{...props}
		/>
	);
}

export {
	Table,
	TableHeader,
	TableBody,
	TableFooter,
	TableHead,
	TableRow,
	TableCell,
	TableCaption,
};
