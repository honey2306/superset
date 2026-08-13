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
		<pre className="my-2 overflow-x-auto rounded-lg bg-black/35 p-2 text-xs leading-5">
			{children}
		</pre>
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
		<div className="mobile-message-markdown break-words leading-6 [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_ol]:my-2 [&_ol]:list-decimal [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc">
			<ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
				{children}
			</ReactMarkdown>
		</div>
	);
}
