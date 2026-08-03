import { describe, expect, it } from "bun:test";
import { authClient } from "./auth-client";

describe("local single-user auth client", () => {
	it("always exposes a ready local session", () => {
		const session = authClient.useSession();

		expect(session.isPending).toBe(false);
		expect(session.data?.user.email).toBe("admin@local.test");
		expect(session.data?.session.activeOrganizationId).toBe(
			"1887f807-99db-49c0-9568-fc085a2fd36a",
		);
	});

	it("returns a stable hook result across renders", () => {
		expect(authClient.useSession()).toBe(authClient.useSession());
		expect(authClient.useSession().refetch).toBe(
			authClient.useSession().refetch,
		);
	});

	it("exposes a stable local active organization", () => {
		const first = authClient.useActiveOrganization();
		const second = authClient.useActiveOrganization();

		expect(first).toBe(second);
		expect(first.data?.id).toBe("1887f807-99db-49c0-9568-fc085a2fd36a");
	});

	it("keeps returning the local session after refetch", async () => {
		await authClient.useSession().refetch();

		expect(authClient.useSession().data?.user.email).toBe("admin@local.test");
	});
});
