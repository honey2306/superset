import { describe, expect, it } from "bun:test";

describe("Electric collection shape options", () => {
	it("uses the credentialed fetch client for every shape stream", async () => {
		const source = await Bun.file(
			new URL("./collections.ts", import.meta.url),
		).text();
		const shapeOptions = source.split("shapeOptions: {").slice(1);

		expect(shapeOptions.length).toBeGreaterThan(0);
		for (const shapeOption of shapeOptions) {
			const fetchClientIndex = shapeOption.indexOf(
				"fetchClient: authenticatedElectricFetch",
			);
			expect(fetchClientIndex).toBeGreaterThanOrEqual(0);
			expect(fetchClientIndex).toBeLessThan(shapeOption.indexOf("getKey:"));
		}
	});
});
