"use client";

import type mermaid from "mermaid";
import { memo, useEffect, useRef } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "../../lib/utils";
import { AcpCodeBlock } from "./acp-code-block";
import { rehypeMermaid } from "./rehype-mermaid";

type MermaidConfig = Parameters<typeof mermaid.initialize>[0];

export type MessageResponseV2Props = {
	children: string;
	className?: string;
	animated?: unknown; // 保持 API 兼容，暂不实现
	isAnimating?: boolean;
	mermaid?: { config?: MermaidConfig }; // mermaid 配置
	plugins?: unknown; // 忽略
	controls?: unknown;
	linkSafety?: unknown;
	mode?: string;
};

const components: Components = {
	code({ className, children }) {
		const match = /language-(\w+)/.exec(className || "");
		const language = match?.[1] || "text";
		const codeString = String(children).replace(/\n$/, "");

		// inline 判断：没有 className（language-*）的 code 是 inline code
		const isInline = !className;

		return (
			<AcpCodeBlock code={codeString} language={language} inline={isInline} />
		);
	},

	// 其他元素保持默认渲染，样式由 .acp-md CSS 控制
	table({ children }) {
		return <table>{children}</table>;
	},
	a({ href, children }) {
		return (
			<a href={href} target="_blank" rel="noopener noreferrer">
				{children}
			</a>
		);
	},
};

export const MessageResponseV2 = memo(
	({ children, className, mermaid }: MessageResponseV2Props) => {
		const containerRef = useRef<HTMLDivElement>(null);

		// Mermaid 初始化
		useEffect(() => {
			if (!containerRef.current) return;

			const mermaidElements = containerRef.current.querySelectorAll(".mermaid");
			if (mermaidElements.length > 0) {
				// 动态 import mermaid
				import("mermaid").then((mermaidModule) => {
					const mermaidInstance = mermaidModule.default;
					mermaidInstance.initialize({
						startOnLoad: true,
						theme: mermaid?.config?.theme || "dark",
						...mermaid?.config,
					});
					// 重新渲染所有 mermaid 图表
					mermaidInstance.run({
						nodes: Array.from(mermaidElements) as HTMLElement[],
					});
				});
			}
		}, [mermaid]);

		return (
			<div ref={containerRef} className={cn("acp-md", className)}>
				<ReactMarkdown
					remarkPlugins={[remarkGfm]}
					rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeMermaid]}
					components={components}
				>
					{children}
				</ReactMarkdown>
			</div>
		);
	},
	(prev, next) =>
		prev.children === next.children && prev.isAnimating === next.isAnimating,
);

MessageResponseV2.displayName = "MessageResponseV2";
