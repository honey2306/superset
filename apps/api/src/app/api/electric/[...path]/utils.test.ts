import { describe, expect, it } from "bun:test";
import { buildWhereClause, getElectricShapeColumns } from "./utils";

describe("buildWhereClause", () => {
	it("scopes automations and todos to the requested organization", async () => {
		for (const table of ["automations", "automation_runs", "todos"]) {
			const clause = await buildWhereClause(
				table,
				"1887f807-99db-49c0-9568-fc085a2fd36a",
				"ea4695ed-43bc-4b31-85a1-9e67deefa301",
			);

			expect(clause?.fragment).toContain("organization_id");
			expect(clause?.params).toEqual(["1887f807-99db-49c0-9568-fc085a2fd36a"]);
		}
	});

	it("rejects unknown tables", async () => {
		expect(
			await buildWhereClause(
				"not_a_real_table",
				"1887f807-99db-49c0-9568-fc085a2fd36a",
				"ea4695ed-43bc-4b31-85a1-9e67deefa301",
			),
		).toBeNull();
	});
});

describe("getElectricShapeColumns", () => {
	it("restricts API key and integration connection shapes to safe columns", () => {
		expect(getElectricShapeColumns("auth.apikeys")).toBe(
			"id,name,start,created_at,last_request",
		);
		expect(getElectricShapeColumns("integration_connections")).toBe(
			"id,organization_id,connected_by_user_id,provider,token_expires_at,external_org_id,external_org_name,config,created_at,updated_at",
		);
	});

	it("leaves unrestricted shapes without a columns parameter", () => {
		expect(getElectricShapeColumns("todos")).toBeNull();
	});
});
