"use client";

import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps, toast } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
				error: <OctagonXIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			toastOptions={{
				style: {
					userSelect: "text",
					WebkitUserSelect: "text",
					maxHeight: "80dvh",
					overflow: "hidden",
				},
				classNames: {
					description: "overflow-y-auto",
				},
			}}
			position="bottom-right"
			offset={{ right: 20, bottom: 20 }}
			gap={8}
			visibleToasts={3}
			style={
				{
					// DS ToastStack: bottom-right, max 3, past tense, error toasts
					// stay open (see patterns/ToastStack). Pull colors from
					// `--surface-sunk` so the toast has more contrast than a plain
					// popover on any theme, and use `shadow-ds-3` for depth.
					"--normal-bg": "var(--surface-sunk)",
					"--normal-text": "var(--fg)",
					"--normal-border": "var(--line)",
					"--border-radius": "var(--r-5)",
					"--success-bg": "var(--success-tint)",
					"--success-border":
						"color-mix(in oklch, var(--success) 25%, transparent)",
					"--success-text":
						"color-mix(in oklch, var(--success) 75%, var(--fg))",
					"--info-bg": "var(--info-tint)",
					"--info-border": "color-mix(in oklch, var(--info) 25%, transparent)",
					"--info-text": "color-mix(in oklch, var(--info) 75%, var(--fg))",
					"--warning-bg": "var(--warning-tint)",
					"--warning-border":
						"color-mix(in oklch, var(--warning) 25%, transparent)",
					"--warning-text":
						"color-mix(in oklch, var(--warning) 75%, var(--fg))",
					"--error-bg": "var(--danger-tint)",
					"--error-border":
						"color-mix(in oklch, var(--danger) 25%, transparent)",
					"--error-text": "color-mix(in oklch, var(--danger) 75%, var(--fg))",
					boxShadow: "var(--shadow-3)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster, toast };
