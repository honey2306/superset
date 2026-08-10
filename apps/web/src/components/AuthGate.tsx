import { Navigate, Outlet } from "react-router-dom";
import { getStoredSession } from "~/lib/auth-store";

export function AuthGate() {
	const session = getStoredSession();
	if (!session) return <Navigate to="/pair" replace />;
	return <Outlet />;
}
