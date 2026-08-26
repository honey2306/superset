import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type MarkdownComponents = ComponentProps<typeof ReactMarkdown>["components"];

export function getSafeMarkdownLinkHref(href?: string): string | undefined {
	if (!href) return undefined;
	if (href.startsWith("/") || href.startsWith("#") || href.startsWith("?")) {
		return href;
	}
	try {
		const protocol = new URL(href).protocol;
		return protocol === "https:" ||
			protocol === "http:" ||
			protocol === "mailto:"
			? href
			: undefined;
	} catch {
		return undefined;
	}
}

const components = {
	a: ({ href, children }: { href?: string; children?: ReactNode }) => {
		const safeHref = getSafeMarkdownLinkHref(href);
		return safeHref ? (
			<a
				href={safeHref}
				target="_blank"
				rel="noopener noreferrer"
				className="underline decoration-white/30 underline-offset-2"
			>
				{children}
			</a>
		) : (
			<span>{children}</span>
		);
	},
	pre: ({ children }: { children?: ReactNode }) => (
		<pre className="overflow-x-auto rounded-lg bg-black/35">{children}</pre>
	),
	code: ({
		children,
		className,
	}: {
		children?: ReactNode;
		className?: string;
	}) => (
		<code
			className={className ?? "rounded bg-white/10 px-1 py-0.5 text-[0.9em]"}
		>
			{children}
		</code>
	),
} satisfies MarkdownComponents;

export function MessageMarkdown({ children }: { children: string }) {
	return (
		<div className="mobile-message-markdown">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
				{children}
			</ReactMarkdown>
		</div>
	);
}
