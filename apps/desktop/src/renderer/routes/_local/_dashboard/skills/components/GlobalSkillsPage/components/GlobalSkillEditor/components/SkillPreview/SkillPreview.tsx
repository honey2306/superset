import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Skill preview is reference text, not an executable document or an editor
 * session. Don't mount terminal/editor stores or fetch remote image URLs. */
export function SkillPreview({ content }: { content: string }) {
	return (
		<div className="prose prose-sm dark:prose-invert max-w-none select-text cursor-text [&_pre]:overflow-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_h1]:text-xl [&_h2]:text-lg [&_a]:text-primary">
			<ReactMarkdown
				skipHtml
				remarkPlugins={[remarkGfm]}
				components={{
					img: ({ alt }) => <span>{alt ?? ""}</span>,
					a: ({ href, children }) => (
						<a href={href} target="_blank" rel="noreferrer noopener">
							{children}
						</a>
					),
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
