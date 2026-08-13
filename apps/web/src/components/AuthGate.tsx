import { Navigate, Outlet } from "react-router-dom";
import { getStoredSession } from "~/lib/auth-store";
import {
	getAutoMateCleanPairPath,
	isAutoMateWebAppPath,
} from "~/lib/automate-resume";

export function AuthGate() {
	const session = getStoredSession();
	if (!session) {
		if (isAutoMateWebAppPath(location.pathname)) {
			window.location.replace(getAutoMateCleanPairPath(location.pathname));
			return null;
		}
		return <Navigate to="/pair" replace />;
	}
	return <Outlet />;
}
