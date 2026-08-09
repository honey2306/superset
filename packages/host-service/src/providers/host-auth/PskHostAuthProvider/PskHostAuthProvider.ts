import { timingSafeEqual } from "node:crypto";
import type { AuthValidationResult, HostAuthProvider } from "../types";

const NO: AuthValidationResult = { ok: false, kind: null };

export class PskHostAuthProvider implements HostAuthProvider {
	private readonly secretBuffer: Buffer;

	constructor(secret: string) {
		this.secretBuffer = Buffer.from(secret);
	}

	validate(request: Request): AuthValidationResult {
		const header = request.headers.get("authorization");
		const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
		if (token === null || !this.safeEqual(token)) return NO;
		return { ok: true, kind: "psk" };
	}

	validateToken(token: string): AuthValidationResult {
		if (!this.safeEqual(token)) return NO;
		return { ok: true, kind: "psk" };
	}

	private safeEqual(input: string): boolean {
		const inputBuffer = Buffer.from(input);
		if (this.secretBuffer.length !== inputBuffer.length) return false;
		return timingSafeEqual(this.secretBuffer, inputBuffer);
	}
}
