"use client";

import type { Element, Root, RootContent } from "hast";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { type BundledLanguage, codeToHast } from "shiki";

type AcpCodeBlockProps = {
	code: string;
	language: string;
	inline?: boolean;
};

export function AcpCodeBlock({ code, language, inline }: AcpCodeBlockProps) {
	const [highlightedCode, setHighlightedCode] = useState<ReactNode>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (inline) return;

		let cancelled = false;

		// 使用 Dracula 主题（与 ACP 的 Dracula 配色一致）
		codeToHast(code, {
			lang: language as BundledLanguage,
			theme: "dracula",
		})
			.then((hast: Root) => {
				if (!cancelled) {
					setHighlightedCode(renderHighlightedCode(hast));
				}
			})
			.catch(() => {
				// Fallback to plain text
				if (!cancelled) {
					setHighlightedCode(code);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [code, language, inline]);

	// Inline code 渲染
	if (inline) {
		return <code>{code}</code>;
	}

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	};

	// 行号生成
	const lines = code.split("\n");
	const lineNumbers = lines.map((_, i) => i + 1).join("\n");

	return (
		<div className="acp-code">
			<div className="acp-code__hd">
				<span className="acp-code__lang" data-lang={language}>
					{language}
				</span>
				<button
					type="button"
					className={`acp-code__copy${copied ? " success" : ""}`}
					onClick={handleCopy}
				>
					{copied ? "✓" : "Copy"}
				</button>
			</div>
			<div className="acp-code__body">
				<div className="acp-code__gutter">
					<pre>{lineNumbers}</pre>
				</div>
				<pre className="acp-code__pre">
					{!highlightedCode ? (
						<code>{code}</code>
					) : (
						<code>{highlightedCode}</code>
					)}
				</pre>
			</div>
		</div>
	);
}

function renderHighlightedCode(hast: Root): ReactNode {
	const pre = hast.children[0];
	if (pre?.type !== "element") return null;

	const codeElement = pre.children[0];
	if (codeElement?.type !== "element" || codeElement.tagName !== "code") {
		return null;
	}

	return codeElement.children.map(renderHastNode);
}

function renderHastNode(node: RootContent, index: number): ReactNode {
	if (node.type === "text") return node.value;
	if (node.type !== "element") return null;

	const { className, style } = node.properties;
	return (
		<span key={index} className={toClassName(className)} style={toStyle(style)}>
			{node.children.map(renderHastNode)}
		</span>
	);
}

function toClassName(
	className: Element["properties"]["className"],
): string | undefined {
	if (typeof className === "string") return className;
	if (Array.isArray(className)) return className.filter(isString).join(" ");
	return undefined;
}

function toStyle(
	style: Element["properties"]["style"],
): CSSProperties | undefined {
	if (typeof style !== "string") return undefined;

	return Object.fromEntries(
		style.split(";").flatMap((declaration) => {
			const [property, ...values] = declaration.split(":");
			if (!property || values.length === 0) return [];
			return [[property.trim(), values.join(":").trim()]];
		}),
	);
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}
