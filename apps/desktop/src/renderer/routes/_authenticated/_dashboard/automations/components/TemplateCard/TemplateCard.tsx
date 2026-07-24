import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import type { AutomationTemplate } from "../../templates";

interface TemplateCardProps {
	template: AutomationTemplate;
	displayDescription?: string;
	displayName?: string;
	onSelect: (template: AutomationTemplate) => void;
}

export function TemplateCard({
	template,
	displayDescription,
	displayName,
	onSelect,
}: TemplateCardProps) {
	return (
		<Card
			role="button"
			tabIndex={0}
			onClick={() => onSelect(template)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onSelect(template);
				}
			}}
			className="py-4 cursor-pointer transition-all duration-150 hover:border-border/80 hover:bg-accent/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
		>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-sm">
					<span className="text-lg leading-none">{template.emoji}</span>
					{displayName ?? template.name}
				</CardTitle>
				<CardDescription className="line-clamp-2">
					{displayDescription ?? template.description}
				</CardDescription>
			</CardHeader>
		</Card>
	);
}
