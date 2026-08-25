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
	test("does not retain a session without explicit activity", () => {
		jest.useFakeTimers();
		const { result } = renderHook(() => useRetainedAcpConnection({}));

		expect(result.current.isConnectionEnabled).toBe(false);
	});

	test("retains activity for exactly 24 hours after leaving", () => {
		jest.useFakeTimers();
		const { result } = renderHook(() => useRetainedAcpConnection({}));

		act(() => result.current.recordActivity());
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
		const { result } = renderHook(() =>
			useRetainedAcpConnection({ retentionMs }),
		);

		act(() => result.current.recordActivity());
		act(() => jest.advanceTimersByTime(750));
		act(() => result.current.recordActivity());
		act(() => jest.advanceTimersByTime(750));
		expect(result.current.isConnectionEnabled).toBe(true);

		act(() => jest.advanceTimersByTime(250));
		expect(result.current.isConnectionEnabled).toBe(false);
	});

	test("retains every ACP agent after activity", () => {
		jest.useFakeTimers();
		const { result } = renderHook(() => useRetainedAcpConnection({}));

		act(() => result.current.recordActivity());
		expect(result.current.isConnectionEnabled).toBe(true);
	});
});
