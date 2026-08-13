import { describe, expect, it, mock } from "bun:test";
import {
	createDesktopEvents,
	DEEP_LINK_NAVIGATE_CHANNEL,
} from "./desktop-events";

describe("desktop events preload bridge", () => {
	it("only subscribes to the allowlisted deep-link event", () => {
		const on = mock();
		const removeListener = mock();
		const events = createDesktopEvents({ on, removeListener });
		const listener = mock();

		expect(Object.keys(events)).toEqual(["onDeepLinkNavigate"]);
		const unsubscribe = events.onDeepLinkNavigate(listener);

		expect(on).toHaveBeenCalledTimes(1);
		expect(on.mock.calls[0]?.[0]).toBe(DEEP_LINK_NAVIGATE_CHANNEL);

		const wrappedListener = on.mock.calls[0]?.[1];
		expect(typeof wrappedListener).toBe("function");
		wrappedListener?.({}, "/workspace/123");
		wrappedListener?.({}, { path: "/untrusted" });
		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith("/workspace/123");

		unsubscribe();
		unsubscribe();
		expect(removeListener).toHaveBeenCalledTimes(1);
		expect(removeListener).toHaveBeenCalledWith(
			DEEP_LINK_NAVIGATE_CHANNEL,
			wrappedListener,
		);
	});
});
