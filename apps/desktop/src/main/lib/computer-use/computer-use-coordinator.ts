type LeaseWaiter = {
	sessionId: string;
	resolve: (generation: number) => void;
	reject: (error: Error) => void;
	removeAbortListener?: () => void;
	timeout?: ReturnType<typeof setTimeout>;
};

export interface ComputerUseLeaseState {
	ownerSessionId: string | null;
	generation: number;
	waiting: number;
	activeCalls: number;
}

const DEFAULT_IDLE_RELEASE_MS = 30_000;
const DEFAULT_ACQUIRE_TIMEOUT_MS = 120_000;

/**
 * The physical desktop is a single shared resource even when Superset runs
 * many ACP sessions. Keep a turn-level lease so one agent's observe -> act ->
 * verify loop cannot be interleaved with another session's foreground input.
 */
export class ComputerUseCoordinator {
	private ownerSessionId: string | null = null;
	private generation = 0;
	private activeCalls = 0;
	private operationQueue: Promise<void> = Promise.resolve();
	private readonly waiters: LeaseWaiter[] = [];
	private readonly releaseWhenIdle = new Set<string>();
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private closed = false;

	constructor(
		private readonly idleReleaseMs = DEFAULT_IDLE_RELEASE_MS,
		private readonly acquireTimeoutMs = DEFAULT_ACQUIRE_TIMEOUT_MS,
	) {}

	state(): ComputerUseLeaseState {
		return {
			ownerSessionId: this.ownerSessionId,
			generation: this.generation,
			waiting: this.waiters.length,
			activeCalls: this.activeCalls,
		};
	}

	async run<T>(
		sessionId: string,
		task: (generation: number) => Promise<T>,
		signal?: AbortSignal,
	): Promise<{ generation: number; result: T }> {
		const generation = await this.acquire(sessionId, signal);
		this.activeCalls += 1;
		this.clearIdleTimer();
		try {
			signal?.throwIfAborted();
			const result = await this.enqueueOperation(async () => {
				if (this.closed) {
					throw new Error("Computer Use coordinator is shut down");
				}
				signal?.throwIfAborted();
				if (
					this.ownerSessionId !== sessionId ||
					this.generation !== generation
				) {
					throw new Error("Computer Use desktop lease changed before dispatch");
				}
				return task(generation);
			});
			return { generation, result };
		} finally {
			this.activeCalls = Math.max(0, this.activeCalls - 1);
			if (this.ownerSessionId === sessionId && this.activeCalls === 0) {
				if (this.releaseWhenIdle.delete(sessionId)) {
					this.releaseOwner(sessionId);
				} else {
					this.scheduleIdleRelease(sessionId);
				}
			}
		}
	}

	endTurn(sessionId: string): void {
		this.removeWaiters(sessionId, new Error("Computer Use turn ended"));
		if (this.ownerSessionId !== sessionId) return;
		if (this.activeCalls === 0) {
			this.releaseOwner(sessionId);
			return;
		}
		this.releaseWhenIdle.add(sessionId);
	}

	shutdown(): void {
		if (this.closed) return;
		this.closed = true;
		this.clearIdleTimer();
		for (const waiter of this.waiters.splice(0)) {
			this.cleanupWaiter(waiter);
			waiter.reject(new Error("Computer Use coordinator shut down"));
		}
		this.ownerSessionId = null;
		this.releaseWhenIdle.clear();
		this.activeCalls = 0;
		this.generation += 1;
	}

	private async acquire(
		sessionId: string,
		signal?: AbortSignal,
	): Promise<number> {
		if (this.closed) throw new Error("Computer Use coordinator is shut down");
		signal?.throwIfAborted();

		if (this.ownerSessionId === sessionId) {
			this.clearIdleTimer();
			return this.generation;
		}
		if (this.ownerSessionId === null) {
			return this.assignOwner(sessionId);
		}

		return new Promise<number>((resolve, reject) => {
			const waiter: LeaseWaiter = { sessionId, resolve, reject };
			const abort = () => {
				const index = this.waiters.indexOf(waiter);
				if (index >= 0) this.waiters.splice(index, 1);
				this.cleanupWaiter(waiter);
				reject(new Error("Computer Use lease acquisition cancelled"));
			};
			if (signal) {
				signal.addEventListener("abort", abort, { once: true });
				waiter.removeAbortListener = () =>
					signal.removeEventListener("abort", abort);
			}
			waiter.timeout = setTimeout(() => {
				const index = this.waiters.indexOf(waiter);
				if (index >= 0) this.waiters.splice(index, 1);
				this.cleanupWaiter(waiter);
				reject(
					new Error(
						`Computer Use desktop is busy with session ${this.ownerSessionId ?? "unknown"}`,
					),
				);
			}, this.acquireTimeoutMs);
			waiter.timeout.unref();
			this.waiters.push(waiter);
		});
	}

	private assignOwner(sessionId: string): number {
		this.clearIdleTimer();
		this.releaseWhenIdle.delete(sessionId);
		this.ownerSessionId = sessionId;
		this.generation += 1;
		return this.generation;
	}

	private releaseOwner(sessionId: string): void {
		if (this.ownerSessionId !== sessionId) return;
		this.clearIdleTimer();
		this.releaseWhenIdle.delete(sessionId);
		this.ownerSessionId = null;
		this.generation += 1;
		this.activateNextWaiter();
	}

	private activateNextWaiter(): void {
		if (this.closed || this.ownerSessionId !== null) return;
		while (this.waiters.length > 0) {
			const waiter = this.waiters.shift();
			if (!waiter) return;
			this.cleanupWaiter(waiter);
			const generation = this.assignOwner(waiter.sessionId);
			waiter.resolve(generation);
			return;
		}
	}

	private removeWaiters(sessionId: string, error: Error): void {
		for (let index = this.waiters.length - 1; index >= 0; index -= 1) {
			const waiter = this.waiters[index];
			if (waiter?.sessionId !== sessionId) continue;
			this.waiters.splice(index, 1);
			if (!waiter) continue;
			this.cleanupWaiter(waiter);
			waiter.reject(error);
		}
	}

	private scheduleIdleRelease(sessionId: string): void {
		this.clearIdleTimer();
		this.idleTimer = setTimeout(() => {
			this.idleTimer = null;
			if (this.ownerSessionId === sessionId && this.activeCalls === 0) {
				this.releaseOwner(sessionId);
			}
		}, this.idleReleaseMs);
		this.idleTimer.unref();
	}

	private clearIdleTimer(): void {
		if (!this.idleTimer) return;
		clearTimeout(this.idleTimer);
		this.idleTimer = null;
	}

	private enqueueOperation<T>(task: () => Promise<T>): Promise<T> {
		const result = this.operationQueue.then(task, task);
		this.operationQueue = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private cleanupWaiter(waiter: LeaseWaiter): void {
		if (waiter.timeout) clearTimeout(waiter.timeout);
		waiter.removeAbortListener?.();
	}
}
