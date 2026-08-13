import { router } from "../index";
import { acpSessionsRouter } from "./acp-sessions";
import { agentsRouter } from "./agents";
import { attachmentsRouter } from "./attachments";
import { authRouter } from "./auth";
import { chatRouter } from "./chat";
import { configRouter } from "./config";
import { filesystemRouter } from "./filesystem";
import { gitRouter } from "./git";
import { githubRouter } from "./github";
import { healthRouter } from "./health";
import { hostRouter } from "./host";
import { issuesRouter } from "./issues";
import { automationsRouter, todosRouter } from "./local-tasks/local-tasks";
import { notificationsRouter } from "./notifications";
import { phoneRouter } from "./phone";
import { portsRouter } from "./ports";
import { projectRouter } from "./project";
import { pullRequestsRouter } from "./pull-requests";
import { settingsRouter } from "./settings";
import { terminalRouter } from "./terminal";
import { terminalAgentsRouter } from "./terminal-agents";
import { usageRouter } from "./usage";
import { workspaceRouter } from "./workspace";
import { workspaceCatalogRouter } from "./workspace-catalog";
import { workspaceCleanupRouter } from "./workspace-cleanup";
import { workspaceCreationRouter } from "./workspace-creation";
import { workspaceProvisioningRouter } from "./workspace-provisioning";
import { workspacesRouter } from "./workspaces";

export const appRouter = router({
	acpSessions: acpSessionsRouter,
	agents: agentsRouter,
	attachments: attachmentsRouter,
	automation: automationsRouter,
	automations: automationsRouter,
	auth: authRouter,
	health: healthRouter,
	host: hostRouter,
	chat: chatRouter,
	config: configRouter,
	filesystem: filesystemRouter,
	git: gitRouter,
	github: githubRouter,
	issues: issuesRouter,
	notifications: notificationsRouter,
	phone: phoneRouter,
	pullRequests: pullRequestsRouter,
	project: projectRouter,
	ports: portsRouter,
	settings: settingsRouter,
	terminal: terminalRouter,
	terminalAgents: terminalAgentsRouter,
	usage: usageRouter,
	todo: todosRouter,
	todos: todosRouter,
	workspace: workspaceRouter,
	workspaces: workspacesRouter,
	workspaceCatalog: workspaceCatalogRouter,
	workspaceCleanup: workspaceCleanupRouter,
	workspaceCreation: workspaceCreationRouter,
	workspaceProvisioning: workspaceProvisioningRouter,
});

export type AppRouter = typeof appRouter;
