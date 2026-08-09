import type { PhoneAuthService } from "../../../runtime/phone";
import type { AuthValidationResult, HostAuthProvider } from "../types";

const NO: AuthValidationResult = { ok: false, kind: null };

/**
 * Validates phone bearer tokens (issued via `phone.pairing.redeem`). Two
 * transports are accepted:
 *   - `Authorization: Bearer <raw-token>` header for HTTP requests.
 *   - `?token=<raw-token>` query string for WebSocket upgrades, since the
 *     browser `WebSocket` constructor cannot set custom headers.
 */
export class PhoneSessionAuthProvider implements HostAuthProvider {
	constructor(private readonly service: PhoneAuthService) {}

	validate(request: Request): AuthValidationResult {
		const header = request.headers.get("authorization");
		const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
		if (!token) return NO;
		return this.validateToken(token);
	}

	validateToken(token: string): AuthValidationResult {
		if (!token) return NO;
		const row = this.service.validateRawToken(token);
		if (!row) return NO;
		return { ok: true, kind: "phone" };
	}
}
