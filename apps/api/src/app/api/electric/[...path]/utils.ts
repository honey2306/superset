import { db } from "@superset/db/client";
import {
	agentCommands,
	automationRuns,
	automations,
	chatSessions,
	githubPullRequests,
	githubRepositories,
	integrationConnections,
	invitations,
	members,
	organizations,
	projects,
	subscriptions,
	taskStatuses,
	tasks,
	teamMembers,
	teams,
	todos,
	v2Clients,
	v2Hosts,
	v2UsersHosts,
	v2Workspaces,
	workspaces,
} from "@superset/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { QueryBuilder } from "drizzle-orm/pg-core";

export interface WhereClause {
	fragment: string;
	params: unknown[];
}

const ELECTRIC_SHAPE_COLUMNS: Readonly<Record<string, string>> = {
	"auth.apikeys": "id,name,start,created_at,last_request",
	integration_connections:
		"id,organization_id,connected_by_user_id,provider,token_expires_at,external_org_id,external_org_name,config,created_at,updated_at",
};

/** Prevent Electric sync from exposing credential-bearing columns. */
export function getElectricShapeColumns(tableName: string): string | null {
	return ELECTRIC_SHAPE_COLUMNS[tableName] ?? null;
}

function build(table: PgTable, column: PgColumn, id: string): WhereClause {
	const whereExpr = eq(sql`${sql.identifier(column.name)}`, id);
	const qb = new QueryBuilder();
	const { sql: query, params } = qb
		.select()
		.from(table)
		.where(whereExpr)
		.toSQL();
	return {
		fragment: query.replace(/^select .* from .* where\s+/i, ""),
		params,
	};
}

export async function buildWhereClause(
	tableName: string,
	organizationId: string,
	userId: string,
): Promise<WhereClause | null> {
	switch (tableName) {
		case "tasks":
			return build(tasks, tasks.organizationId, organizationId);
		case "task_statuses":
			return build(taskStatuses, taskStatuses.organizationId, organizationId);
		case "projects":
			return build(projects, projects.organizationId, organizationId);
		case "v2_hosts":
			return build(v2Hosts, v2Hosts.organizationId, organizationId);
		case "v2_clients":
			return build(v2Clients, v2Clients.organizationId, organizationId);
		case "v2_users_hosts":
			return build(v2UsersHosts, v2UsersHosts.organizationId, organizationId);
		case "v2_workspaces":
			return build(v2Workspaces, v2Workspaces.organizationId, organizationId);
		case "auth.members":
			return build(members, members.organizationId, organizationId);
		case "auth.invitations":
			return build(invitations, invitations.organizationId, organizationId);
		case "auth.teams":
			return build(teams, teams.organizationId, organizationId);
		case "auth.team_members":
			return build(teamMembers, teamMembers.organizationId, organizationId);
		case "auth.organizations": {
			const userMemberships = await db.query.members.findMany({
				where: eq(members.userId, userId),
				columns: { organizationId: true },
			});
			const organizationIds = [
				...new Set(
					userMemberships.map((membership) => membership.organizationId),
				),
			];
			if (organizationIds.length === 0) {
				return { fragment: "1 = 0", params: [] };
			}
			const whereExpr = inArray(
				sql`${sql.identifier(organizations.id.name)}`,
				organizationIds,
			);
			const qb = new QueryBuilder();
			const { sql: query, params } = qb
				.select()
				.from(organizations)
				.where(whereExpr)
				.toSQL();
			return {
				fragment: query.replace(/^select .* from .* where\s+/i, ""),
				params,
			};
		}
		case "auth.users":
			return {
				fragment: `"organization_ids" @> ARRAY[$1::uuid]`,
				params: [organizationId],
			};
		case "agent_commands":
			return build(agentCommands, agentCommands.organizationId, organizationId);
		case "auth.apikeys":
			return {
				fragment: `"organization_id" = $1`,
				params: [organizationId],
			};
		case "integration_connections":
			return build(
				integrationConnections,
				integrationConnections.organizationId,
				organizationId,
			);
		case "subscriptions":
			return build(subscriptions, subscriptions.referenceId, organizationId);
		case "workspaces":
			return build(workspaces, workspaces.organizationId, organizationId);
		case "chat_sessions":
			return build(chatSessions, chatSessions.organizationId, organizationId);
		case "github_repositories":
			return build(
				githubRepositories,
				githubRepositories.organizationId,
				organizationId,
			);
		case "github_pull_requests":
			return build(
				githubPullRequests,
				githubPullRequests.organizationId,
				organizationId,
			);
		case "automations":
			return build(automations, automations.organizationId, organizationId);
		case "automation_runs":
			return build(
				automationRuns,
				automationRuns.organizationId,
				organizationId,
			);
		case "todos":
			return build(todos, todos.organizationId, organizationId);
		default:
			return null;
	}
}
