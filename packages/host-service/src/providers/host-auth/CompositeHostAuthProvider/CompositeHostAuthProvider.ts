import type { AuthValidationResult, HostAuthProvider } from "../types";

/**
 * Tries each inner provider in order. First `ok` wins; otherwise returns a
 * negative validation. Used to layer phone-session auth on top of the PSK
 * so desktop callers keep working unchanged.
 */
export class CompositeHostAuthProvider implements HostAuthProvider {
	constructor(private readonly providers: readonly HostAuthProvider[]) {}

	async validate(request: Request): Promise<AuthValidationResult> {
		for (const p of this.providers) {
			const result = await p.validate(request);
			if (result.ok) return result;
		}
		return { ok: false, kind: null };
	}

	async validateToken(token: string): Promise<AuthValidationResult> {
		for (const p of this.providers) {
			const result = await p.validateToken(token);
			if (result.ok) return result;
		}
		return { ok: false, kind: null };
	}
}
