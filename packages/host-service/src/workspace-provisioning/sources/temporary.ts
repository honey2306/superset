import type { SourceHandler } from "./types";

/**
 * `ProjectTarget.temporary` — the singleton temporary Project (execplan
 * §Decision 10). MVP: reuse if already claimed.
 */
export const temporaryHandler: SourceHandler = async ({
	request,
	ctx,
	launches,
	warnings,
}) => {
	if (request.project.kind !== "temporary") {
		throw new Error(
			`temporaryHandler cannot handle project.kind='${request.project.kind}'`,
		);
	}
	const singletonKey = request.project.singletonKey;
	const existing = ctx.db.query.projects
		.findFirst({
			where: (row, { eq }) => eq(row.singletonKey, singletonKey),
		})
		.sync();
	if (existing) {
		const main = ctx.db.query.workspaces
			.findFirst({
				where: (w, { and, eq }) =>
					and(eq(w.projectId, existing.id), eq(w.type, "main")),
			})
			.sync();
		return {
			projectId: existing.id,
			workspaceId: main?.id ?? existing.id,
			disposition: "reused",
			launches,
			warnings,
		};
	}
	throw new Error(
		"temporary provisioning not yet materialized (M2 MVP scaffold)",
	);
};
