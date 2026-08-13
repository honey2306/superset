import type { MessageKey } from "renderer/providers/I18nProvider";
import type { AutomationTemplate } from "./data";

type Translate = (key: MessageKey) => string;

const CATEGORY_KEYS = {
	growth: "automations.category.growth",
	quality: "automations.category.quality",
	"release-prep": "automations.category.releasePrep",
	"status-reports": "automations.category.statusReports",
} as const satisfies Record<string, MessageKey>;

const TEMPLATE_KEYS = {
	"benchmark-regressions": {
		description: "automations.template.benchmarkRegressions.description",
		name: "automations.template.benchmarkRegressions.name",
	},
	"bug-scan": {
		description: "automations.template.bugScan.description",
		name: "automations.template.bugScan.name",
	},
	"changelog-update": {
		description: "automations.template.changelogUpdate.description",
		name: "automations.template.changelogUpdate.name",
	},
	"ci-failures": {
		description: "automations.template.ciFailures.description",
		name: "automations.template.ciFailures.name",
	},
	"pre-release-check": {
		description: "automations.template.preReleaseCheck.description",
		name: "automations.template.preReleaseCheck.name",
	},
	"release-notes": {
		description: "automations.template.releaseNotes.description",
		name: "automations.template.releaseNotes.name",
	},
	"skill-deepening": {
		description: "automations.template.skillDeepening.description",
		name: "automations.template.skillDeepening.name",
	},
	"small-side-project": {
		description: "automations.template.smallSideProject.description",
		name: "automations.template.smallSideProject.name",
	},
	standup: {
		description: "automations.template.standup.description",
		name: "automations.template.standup.name",
	},
	"team-pr-recap": {
		description: "automations.template.teamPrRecap.description",
		name: "automations.template.teamPrRecap.name",
	},
	"weekly-pr-digest": {
		description: "automations.template.weeklyPrDigest.description",
		name: "automations.template.weeklyPrDigest.name",
	},
} as const satisfies Record<
	string,
	{ description: MessageKey; name: MessageKey }
>;

export function localizeAutomationCategory(id: string, t: Translate): string {
	const key = CATEGORY_KEYS[id as keyof typeof CATEGORY_KEYS];
	return key ? t(key) : id;
}

export function localizeAutomationTemplate(
	template: AutomationTemplate,
	t: Translate,
): Pick<AutomationTemplate, "description" | "name"> {
	const keys = TEMPLATE_KEYS[template.id as keyof typeof TEMPLATE_KEYS];
	if (!keys) {
		return { description: template.description, name: template.name };
	}
	return {
		description: t(keys.description),
		name: t(keys.name),
	};
}
