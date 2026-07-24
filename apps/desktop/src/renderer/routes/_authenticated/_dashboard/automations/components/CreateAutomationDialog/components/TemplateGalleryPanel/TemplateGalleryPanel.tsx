import { Button } from "@superset/ui/button";
import { DialogClose } from "@superset/ui/dialog";
import { LuArrowLeft, LuX } from "react-icons/lu";
import { useTranslation } from "renderer/providers/I18nProvider";
import {
	AUTOMATION_TEMPLATE_CATEGORIES,
	type AutomationTemplate,
	localizeAutomationCategory,
	localizeAutomationTemplate,
} from "../../../../templates";
import { TemplateCard } from "../../../TemplateCard";

interface TemplateGalleryPanelProps {
	onBack: () => void;
	onSelectTemplate: (template: AutomationTemplate) => void;
}

export function TemplateGalleryPanel({
	onBack,
	onSelectTemplate,
}: TemplateGalleryPanelProps) {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col h-full min-h-0">
			<div className="flex items-center gap-2 p-4 pb-3 border-b">
				<Button
					variant="ghost"
					size="icon-sm"
					onClick={onBack}
					aria-label={t("automations.back")}
				>
					<LuArrowLeft className="size-4" />
				</Button>
				<h2 className="flex-1 text-base font-medium">
					{t("automations.templatesTitle")}
				</h2>
				<DialogClose asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={t("automations.close")}
					>
						<LuX className="size-4" />
					</Button>
				</DialogClose>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-6">
				{AUTOMATION_TEMPLATE_CATEGORIES.map((category) => (
					<section key={category.id} className="flex flex-col gap-3">
						<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
							{localizeAutomationCategory(category.id, t)}
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
							{category.templates.map((template) => {
								const display = localizeAutomationTemplate(template, t);
								return (
									<TemplateCard
										key={template.id}
										template={template}
										displayName={display.name}
										displayDescription={display.description}
										onSelect={onSelectTemplate}
									/>
								);
							})}
						</div>
					</section>
				))}
			</div>
		</div>
	);
}
