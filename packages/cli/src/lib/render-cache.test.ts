import { expect, test } from "bun:test";
import { RenderCache } from "./render-cache";

test("unchanged messages avoid repeated Markdown layout", () => {
	const cache = new RenderCache();
	let calls = 0;
	const render = () => {
		calls += 1;
		return ["layout"];
	};
	for (let frame = 0; frame < 20; frame += 1)
		cache.get("message+width+agent", render);
	expect(calls).toBe(1);
});

test("cache evicts least recently used layouts within its memory budget", () => {
	const cache = new RenderCache(8);
	cache.get("a", () => ["aaa"]);
	cache.get("b", () => ["bbb"]);
	cache.get("a", () => ["unexpected"]);
	cache.get("c", () => ["ccc"]);
	let recomputed = false;
	cache.get("b", () => {
		recomputed = true;
		return ["bbb"];
	});
	expect(recomputed).toBe(true);
});

test("oversized layouts are rendered without being retained", () => {
	const cache = new RenderCache(2);
	let calls = 0;
	for (let frame = 0; frame < 2; frame += 1)
		cache.get("key", () => {
			calls += 1;
			return ["large"];
		});
	expect(calls).toBe(2);
});
