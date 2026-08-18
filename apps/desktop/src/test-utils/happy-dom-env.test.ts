import { expect, test } from "bun:test";

test("desktop test preload installs a complete browser environment", () => {
	expect(document.body).toBeDefined();
	expect(typeof window.addEventListener).toBe("function");
	expect(typeof window.clearTimeout).toBe("function");
	expect(typeof window.getComputedStyle).toBe("function");
	expect(typeof document.body.querySelector).toBe("function");
});
