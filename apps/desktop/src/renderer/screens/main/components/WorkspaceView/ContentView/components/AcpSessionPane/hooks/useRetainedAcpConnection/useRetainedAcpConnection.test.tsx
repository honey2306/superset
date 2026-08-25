import { afterEach, beforeAll, describe, expect, jest, test } from "bun:test";
import { ensureHappyDom } from "test-utils/happy-dom-env";
import {
	ACP_ACTIVITY_CONNECTION_RETENTION_MS,
	useRetainedAcpConnection,
} from "./useRetainedAcpConnection";

let act: typeof import("@testing-library/react/pure").act;
let cleanup: typeof import("@testing-library/react/pure").cleanup;
let renderHook: typeof import("@testing-library/react/pure").renderHook;

beforeAll(async () => {
	await ensureHappyDom();
	({ act, cleanup, renderHook } = await import("@testing-library/react/pure"));
});

afterEach(() => {
	cleanup();
	jest.useRealTimers();
});

describe("useRetainedAcpConnection", () => {
	test("retains an opened conversation after leaving its workspace", () => {
		jest.useFakeTimers();
		const { result, rerender } = renderHook(
			({ isWorkspaceActive }) =>
				useRetainedAcpConnection({ isWorkspaceActive }),
			{ initialProps: { isWorkspaceActive: true } },
		);

		expect(result.current.isConnectionEnabled).toBe(true);
		rerender({ isWorkspaceActive: false });
		expect(result.current.isConnectionEnabled).toBe(true);

		act(() =>
			jest.advanceTimersByTime(ACP_ACTIVITY_CONNECTION_RETENTION_MS - 1),
		);
		expect(result.current.isConnectionEnabled).toBe(true);

		act(() => jest.advanceTimersByTime(1));
		expect(result.current.isConnectionEnabled).toBe(false);
	});

	test("retains activity for exactly 24 hours after leaving", () => {
		jest.useFakeTimers();
		const { result, rerender } = renderHook(
			({ isWorkspaceActive }) =>
				useRetainedAcpConnection({ isWorkspaceActive }),
			{ initialProps: { isWorkspaceActive: true } },
		);

		act(() => result.current.recordActivity());
		rerender({ isWorkspaceActive: false });
		expect(result.current.isConnectionEnabled).toBe(true);

		act(() =>
			jest.advanceTimersByTime(ACP_ACTIVITY_CONNECTION_RETENTION_MS - 1),
		);
		expect(result.current.isConnectionEnabled).toBe(true);

		act(() => jest.advanceTimersByTime(1));
		expect(result.current.isConnectionEnabled).toBe(false);
	});

	test("later activity resets the retention deadline", () => {
		jest.useFakeTimers();
		const retentionMs = 1_000;
		const { result, rerender } = renderHook(
			({ isWorkspaceActive }) =>
				useRetainedAcpConnection({
					isWorkspaceActive,
					retentionMs,
				}),
			{ initialProps: { isWorkspaceActive: true } },
		);

		act(() => result.current.recordActivity());
		act(() => jest.advanceTimersByTime(750));
		act(() => result.current.recordActivity());
		rerender({ isWorkspaceActive: false });
		act(() => jest.advanceTimersByTime(750));
		expect(result.current.isConnectionEnabled).toBe(true);

		act(() => jest.advanceTimersByTime(250));
		expect(result.current.isConnectionEnabled).toBe(false);
	});

	test("retains every ACP agent after activity", () => {
		jest.useFakeTimers();
		const { result, rerender } = renderHook(
			({ isWorkspaceActive }) =>
				useRetainedAcpConnection({ isWorkspaceActive }),
			{ initialProps: { isWorkspaceActive: true } },
		);

		act(() => result.current.recordActivity());
		rerender({ isWorkspaceActive: false });
		expect(result.current.isConnectionEnabled).toBe(true);
	});
});
