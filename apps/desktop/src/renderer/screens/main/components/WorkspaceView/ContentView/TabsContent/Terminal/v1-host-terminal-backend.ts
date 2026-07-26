export interface V1HostTerminalBackend {
	hostUrl: string;
	hostWorkspaceId: string;
}

const backends = new Map<string, V1HostTerminalBackend>();
const listeners = new Map<string, Set<() => void>>();

export function registerV1HostTerminalBackend(
	v1WorkspaceId: string,
	backend: V1HostTerminalBackend,
): () => void {
	backends.set(v1WorkspaceId, backend);
	for (const listener of listeners.get(v1WorkspaceId) ?? []) listener();
	return () => {
		if (backends.get(v1WorkspaceId) === backend) {
			backends.delete(v1WorkspaceId);
		}
	};
}

export function getV1HostTerminalBackend(
	v1WorkspaceId: string,
): V1HostTerminalBackend | null {
	return backends.get(v1WorkspaceId) ?? null;
}

export function waitForV1HostTerminalBackend(
	v1WorkspaceId: string,
	timeoutMs = 20_000,
): Promise<V1HostTerminalBackend> {
	const existing = backends.get(v1WorkspaceId);
	if (existing) return Promise.resolve(existing);

	return new Promise((resolve, reject) => {
		const workspaceListeners =
			listeners.get(v1WorkspaceId) ?? new Set<() => void>();
		listeners.set(v1WorkspaceId, workspaceListeners);
		const cleanup = () => {
			clearTimeout(timer);
			workspaceListeners.delete(onChange);
			if (workspaceListeners.size === 0) listeners.delete(v1WorkspaceId);
		};
		const onChange = () => {
			const backend = backends.get(v1WorkspaceId);
			if (!backend) return;
			cleanup();
			resolve(backend);
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(
				new Error(
					`Timed out waiting for host terminal backend for ${v1WorkspaceId}`,
				),
			);
		}, timeoutMs);
		workspaceListeners.add(onChange);
	});
}
