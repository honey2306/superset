import { describe, expect, it } from "bun:test";
import config from "./electron-builder.personal";

describe("Personal electron-builder config", () => {
	it("uses an isolated identity and never registers the stable protocol", () => {
		expect(config.appId).toBe("com.superset.desktop.personal");
		expect(config.productName).toBe("Superset Personal");
		expect(config.publish).toBeNull();
		expect(config.protocols).toEqual([
			{
				name: "Superset Personal",
				schemes: ["superset-personal"],
			},
		]);
	});
});
