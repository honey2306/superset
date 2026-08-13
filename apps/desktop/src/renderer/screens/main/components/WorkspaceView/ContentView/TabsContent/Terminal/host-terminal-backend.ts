export interface HostTerminalBackend {
	hostUrl: string;
	hostWorkspaceId: string;
}

const backends = new Map<string, HostTerminalBackend>();
const listeners = new Map<string, Set<() => void>>();

export function registerHostTerminalBackend(
	workspaceId: string,
	backend: HostTerminalBackend,
): () => void {
	backends.set(workspaceId, backend);
	for (const listener of listeners.get(workspaceId) ?? []) listener();
	return () => {
		if (backends.get(workspaceId) === backend) {
			backends.delete(workspaceId);
		}
	};
}

export function getHostTerminalBackend(
	workspaceId: string,
): HostTerminalBackend | null {
	return backends.get(workspaceId) ?? null;
}

export function waitForHostTerminalBackend(
	workspaceId: string,
	timeoutMs = 20_000,
): Promise<HostTerminalBackend> {
	const existing = backends.get(workspaceId);
	if (existing) return Promise.resolve(existing);

	return new Promise((resolve, reject) => {
		const workspaceListeners =
			listeners.get(workspaceId) ?? new Set<() => void>();
		listeners.set(workspaceId, workspaceListeners);
		const cleanup = () => {
			clearTimeout(timer);
			workspaceListeners.delete(onChange);
			if (workspaceListeners.size === 0) listeners.delete(workspaceId);
		};
		const onChange = () => {
			const backend = backends.get(workspaceId);
			if (!backend) return;
			cleanup();
			resolve(backend);
		};
		const timer = setTimeout(() => {
			cleanup();
			reject(
				new Error(
					`Timed out waiting for host terminal backend for ${workspaceId}`,
				),
			);
		}, timeoutMs);
		workspaceListeners.add(onChange);
	});
}
