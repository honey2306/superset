export { useEventBus } from "./hooks/useEventBus";
export { useGitChangeEvents } from "./hooks/useGitChangeEvents";
export {
	createDirectSocket,
	type DirectSocket,
	type DirectSocketOptions,
	type DirectSocketTelemetryEvent,
	setDirectSocketTelemetry,
} from "./lib/directSocket";
export {
	type AcpSessionChangedPayload,
	type AgentIdentity,
	type AgentLifecyclePayload,
	type CatalogChangedPayload,
	type EventBusHandle,
	type GitChangedPayload,
	getEventBus,
	type PortChangedPayload,
	type ProjectChangedPayload,
	type ProjectSnapshotPayload,
	type TerminalLifecyclePayload,
	type WorkspaceChangedPayload,
	type WorkspaceOperationChangedPayload,
	type WorkspaceSnapshotPayload,
} from "./lib/eventBus";
export {
	createInMemoryProvisioningAdapter,
	createTrpcProvisioningAdapter,
	type InitialLaunchResult,
	type InitialSessionIntent,
	type ProvisioningAdapter,
	type ProvisioningAdapterFactoryDeps,
	type ProvisionWorkspaceRequest,
	type WorkspaceOperation,
	type WorkspaceOperationState,
} from "./lib/workspaceProvisioning";
export {
	useMaybeWorkspaceClient,
	useWorkspaceClient,
	useWorkspaceHostUrl,
	useWorkspaceWsUrl,
	type WorkspaceClientContextValue,
	WorkspaceClientProvider,
} from "./providers/WorkspaceClientProvider";
export { workspaceTrpc } from "./workspace-trpc";
