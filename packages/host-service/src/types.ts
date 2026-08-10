import type { Octokit } from "@octokit/rest";
import type { ChatService } from "@superset/chat/server/desktop";
import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import type { HostDb } from "./db";
import type { EventBus } from "./events";
import type { AuthKind } from "./providers/host-auth";
import type { AcpSessionRuntime } from "./runtime/acp-sessions";
import type { ChatRuntimeManager } from "./runtime/chat";
import type { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider, GitFactory } from "./runtime/git";
import type { PhoneAuthService } from "./runtime/phone";
import type { PullRequestRuntimeManager } from "./runtime/pull-requests";
import type { TerminalAgentStore } from "./terminal-agents";
import type { ExecGh } from "./trpc/router/workspace-creation/utils/exec-gh";
import type { WorkspaceCatalog } from "./workspace-catalog";
import type { WorkspaceProvisioning } from "./workspace-provisioning";

export type ApiClient = TRPCClient<AppRouter>;

export interface HostServiceRuntime {
	acpSessions: AcpSessionRuntime;
	/**
	 * Feature gate for the pre-release ACP session harness. Off by default;
	 * app.ts turns it on via SUPERSET_ACP_SESSIONS=1 (or a test-injected
	 * manager). When off, the acpSessions router rejects every call and the
	 * WS stream route is not registered.
	 */
	acpSessionsEnabled: boolean;
	auth: ChatService;
	chat: ChatRuntimeManager;
	filesystem: WorkspaceFilesystemManager;
	phoneAuth: PhoneAuthService;
	pullRequests: PullRequestRuntimeManager;
	workspaceProvisioning: WorkspaceProvisioning;
}

export interface HostServiceContext {
	git: GitFactory;
	credentials: GitCredentialProvider;
	github: () => Promise<Octokit>;
	execGh: ExecGh;
	api: ApiClient;
	db: HostDb;
	catalog: WorkspaceCatalog;
	runtime: HostServiceRuntime;
	eventBus: EventBus;
	terminalAgentStore: TerminalAgentStore;
	organizationId: string;
	isAuthenticated: boolean;
	authKind: AuthKind | null;
	clientMachineId?: string;
	/**
	 * Best-effort client IP for the current request. Used by per-caller rate
	 * limits (e.g. `phone.pairing.redeem`). Resolved from `x-forwarded-for`
	 * when a relay/reverse-proxy is in front of us, otherwise the TCP peer
	 * address from Hono's `getConnInfo`. May be undefined for in-process
	 * callers (createCaller) or transports that don't expose a peer address.
	 */
	remoteAddress?: string;
}
