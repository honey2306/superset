import type { SkillScope } from "@superset/shared/skills";
export interface SkillProject {
	id: string;
	name: string;
	repoPath: string;
}
export const scopeKey = (scope: SkillScope) =>
	scope.kind === "global" ? "global" : `project:${scope.projectId}`;
export const skillKeys = {
	all: (host: string) => ["skill-library", host] as const,
	list: (host: string, scope: SkillScope) =>
		["skill-library", host, scopeKey(scope), "list"] as const,
	detail: (host: string, scope: SkillScope, name: string | null) =>
		["skill-library", host, scopeKey(scope), "detail", name] as const,
	file: (
		host: string,
		scope: SkillScope,
		name: string,
		file: string,
		revision: string,
	) =>
		[
			"skill-library",
			host,
			scopeKey(scope),
			"file",
			name,
			file,
			revision,
		] as const,
};
