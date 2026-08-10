import { auth } from "@superset/auth/server";
import { db } from "@superset/db/client";
import { members } from "@superset/db/schema";
import { eq } from "drizzle-orm";
import { buildWhereClause, getElectricShapeColumns } from "./utils";

const ELECTRIC_PROTOCOL_QUERY_PARAMS = new Set([
	"live",
	"live_sse",
	"experimental_live_sse",
	"handle",
	"offset",
	"cursor",
	"expired_handle",
	"log",
	"subset__where",
	"subset__limit",
	"subset__offset",
	"subset__order_by",
	"subset__params",
	"subset__where_expr",
	"subset__order_by_expr",
	"cache-buster",
]);

interface AuthInfo {
	userId: string;
	organizationIds: string[];
}

async function authenticate(request: Request): Promise<AuthInfo | null> {
	let userId: string | null = null;
	const bearer = request.headers.get("Authorization");
	if (bearer?.startsWith("Bearer ")) {
		try {
			const { payload } = await auth.api.verifyJWT({
				body: { token: bearer.slice(7) },
			});
			if (typeof payload?.sub === "string") userId = payload.sub;
		} catch {
			// A valid browser session remains an allowed fallback.
		}
	}

	if (!userId) {
		const session = await auth.api.getSession({ headers: request.headers });
		userId = session?.user.id ?? null;
	}
	if (!userId) return null;

	const userMemberships = await db.query.members.findMany({
		where: eq(members.userId, userId),
		columns: { organizationId: true },
	});
	return {
		userId,
		organizationIds: [
			...new Set(
				userMemberships.map((membership) => membership.organizationId),
			),
		],
	};
}

export async function GET(request: Request): Promise<Response> {
	const authInfo = await authenticate(request);
	if (!authInfo) return new Response("Unauthorized", { status: 401 });

	const requestUrl = new URL(request.url);
	const tableName = requestUrl.searchParams.get("table");
	if (!tableName)
		return new Response("Missing table parameter", { status: 400 });

	const organizationId = requestUrl.searchParams.get("organizationId") ?? "";
	if (
		tableName !== "auth.organizations" &&
		(!organizationId || !authInfo.organizationIds.includes(organizationId))
	) {
		return new Response("Not a member of this organization", { status: 403 });
	}

	const whereClause = await buildWhereClause(
		tableName,
		organizationId,
		authInfo.userId,
	);
	if (!whereClause) {
		return new Response(`Unknown table: ${tableName}`, { status: 400 });
	}

	const electricShapeUrl = process.env.ELECTRIC_URL;
	if (!electricShapeUrl) {
		return new Response("Electric is not configured", { status: 503 });
	}
	const upstreamUrl = new URL(electricShapeUrl);
	const electricSecret = process.env.ELECTRIC_SECRET;
	if (electricSecret) upstreamUrl.searchParams.set("secret", electricSecret);

	requestUrl.searchParams.forEach((value, key) => {
		if (ELECTRIC_PROTOCOL_QUERY_PARAMS.has(key)) {
			upstreamUrl.searchParams.set(key, value);
		}
	});
	upstreamUrl.searchParams.set("table", tableName);
	upstreamUrl.searchParams.set("where", whereClause.fragment);
	whereClause.params.forEach((value, index) => {
		upstreamUrl.searchParams.set(`params[${index + 1}]`, String(value));
	});
	const columns = getElectricShapeColumns(tableName);
	if (columns) upstreamUrl.searchParams.set("columns", columns);

	const upstreamResponse = await fetch(upstreamUrl);
	const headers = new Headers(upstreamResponse.headers);
	if (headers.has("content-encoding")) {
		headers.delete("content-encoding");
		headers.delete("content-length");
	}
	return new Response(upstreamResponse.body, {
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
		headers,
	});
}
