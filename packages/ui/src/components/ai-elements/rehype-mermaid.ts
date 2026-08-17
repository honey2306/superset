import type { Element, Root, Text } from "hast";
import { visit } from "unist-util-visit";

/**
 * Rehype plugin to transform ```mermaid code blocks into .mermaid containers
 * that can be rendered by mermaid.js
 */
export function rehypeMermaid() {
	return (tree: Root) => {
		visit(tree, "element", (node: Element, index, parent) => {
			// Look for <code class="language-mermaid">...</code>
			if (
				node.tagName === "code" &&
				Array.isArray(node.properties?.className) &&
				node.properties.className.includes("language-mermaid")
			) {
				// Extract mermaid code from text node
				const textNode = node.children.find(
					(child): child is Text => child.type === "text",
				);
				const code = textNode?.value || "";

				if (code && parent && typeof index === "number") {
					// Replace <code> with <div class="mermaid-container"><pre class="mermaid">...</pre></div>
					parent.children[index] = {
						type: "element",
						tagName: "div",
						properties: { className: ["mermaid-container"] },
						children: [
							{
								type: "element",
								tagName: "pre",
								properties: { className: ["mermaid"] },
								children: [{ type: "text", value: code }],
							},
						],
					};
				}
			}
		});
	};
}
