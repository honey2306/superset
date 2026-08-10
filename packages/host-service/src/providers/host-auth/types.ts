export type AuthKind = "psk" | "phone";

export interface AuthValidationResult {
	ok: boolean;
	kind: AuthKind | null;
}

export interface HostAuthProvider {
	validate(
		request: Request,
	): Promise<AuthValidationResult> | AuthValidationResult;
	validateToken(
		token: string,
	): Promise<AuthValidationResult> | AuthValidationResult;
}
