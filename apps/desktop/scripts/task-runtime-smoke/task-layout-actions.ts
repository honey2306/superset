interface Context {
	send<T = unknown>(
		method: string,
		params?: Record<string, unknown>,
	): Promise<T>;
	evaluate<T>(expression: string): Promise<T>;
	until<T>(
		get: () => Promise<T>,
		ready: (value: T) => boolean,
		label: string,
		timeout?: number,
	): Promise<T>;
	clickText(text: string, selector?: string): Promise<void>;
	fill(selector: string, text: string): Promise<void>;
	screenshot(name: string): Promise<void>;
}
async function measure(c: Context) {
	return c.evaluate<{
		width: number;
		parentWidth: number;
		overflow: boolean;
		asideVisible: boolean;
		detailVisible: boolean;
	}>(
		`(()=>{const e=document.querySelector('[data-testid="agent-tasks-page"]');const r=e.getBoundingClientRect();const visible=s=>{const x=document.querySelector(s);return !!x&&x.getBoundingClientRect().width>0;};return {width:r.width,parentWidth:e.parentElement.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth,asideVisible:visible('.task-hub__list'),detailVisible:visible('.task-hub__detail')};})()`,
	);
}
export async function verifyTaskEmptyLayout(c: Context) {
	await c.until(
		() =>
			c.evaluate<boolean>(
				'Boolean(document.querySelector("[data-testid=task-empty-state]"))',
			),
		Boolean,
		"Empty state not mounted",
	);
	const metrics = await measure(c);
	if (
		Math.abs(metrics.width - metrics.parentWidth) > 1 ||
		metrics.asideVisible ||
		metrics.detailVisible ||
		metrics.overflow
	)
		throw new Error(`Empty layout regression ${JSON.stringify(metrics)}`);
	await c.screenshot("overview-00-empty-full-width.png");
	return metrics;
}
export async function verifyTaskPopulatedLayout(c: Context) {
	const wide = await measure(c);
	if (
		Math.abs(wide.width - wide.parentWidth) > 1 ||
		!wide.asideVisible ||
		!wide.detailVisible ||
		wide.overflow
	)
		throw new Error(`Populated layout regression ${JSON.stringify(wide)}`);
	await c.fill('input[aria-label="Search tasks…"]', "no-match-regression-999");
	await c.until(
		() => c.evaluate<string>("document.body.innerText"),
		(text) => text.includes("No matching tasks"),
		"Filter did not show a meaningful empty state",
	);
	const filtered = await measure(c);
	if (filtered.asideVisible || filtered.detailVisible)
		throw new Error("Filtering reserved an empty detail pane");
	await c.clickText("Clear filters");
	await c.until(
		() =>
			c.evaluate<boolean>(
				'Boolean(document.querySelector("[data-testid=task-list-row]"))',
			),
		Boolean,
		"Clear filters lost task rows",
	);
	await c.send("Emulation.setDeviceMetricsOverride", {
		width: 600,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await c.until(
		() => measure(c),
		(m) => m.width === 600 && !m.detailVisible && m.asideVisible,
		"Narrow list must not reserve off-screen details",
	);
	const point = await c.evaluate<{ x: number; y: number }>(
		`(()=>{const e=document.querySelector('[data-testid="task-list-row"]');const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`,
	);
	await c.send("Input.dispatchMouseEvent", {
		type: "mousePressed",
		button: "left",
		clickCount: 1,
		...point,
	});
	await c.send("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		button: "left",
		clickCount: 1,
		...point,
	});
	const narrow = await c.until(
		() => measure(c),
		(m) => m.detailVisible && !m.asideVisible,
		"Narrow task selection did not open detail",
	);
	if (narrow.overflow)
		throw new Error("Narrow task detail overflows horizontally");
	await c.screenshot("overview-04-narrow-detail.png");
	await c.clickText("Back to tasks");
	await c.until(
		() => measure(c),
		(m) => m.asideVisible && !m.detailVisible,
		"Back did not restore narrow list",
	);
	await c.send("Emulation.clearDeviceMetricsOverride");
	await c.until(
		() => measure(c),
		(m) => m.detailVisible && m.asideVisible,
		"Wide layout did not recover after resizing",
	);
	return { wide, filtered, narrow };
}
