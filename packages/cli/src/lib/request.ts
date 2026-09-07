/** Bound control-plane HTTP waits; never retry mutations with unknown outcomes. */
export const HOST_REQUEST_TIMEOUT_MS = 30_000;

export async function hostFetch(
	input: string | URL | Request,
	init?: RequestInit,
	timeoutMs = HOST_REQUEST_TIMEOUT_MS,
): Promise<Response> {
	const deadline = AbortSignal.timeout(timeoutMs);
	const upstream =
		init?.signal ?? (input instanceof Request ? input.signal : null);
	const signal = upstream ? AbortSignal.any([upstream, deadline]) : deadline;
	try {
		return await fetch(input, { ...init, signal });
	} catch (error) {
		if (deadline.aborted && !upstream?.aborted) {
			throw new Error(
				"Host 请求超时；操作可能已被接收，请先检查会话状态，不要重复发送。",
				{ cause: error },
			);
		}
		throw error;
	}
}
