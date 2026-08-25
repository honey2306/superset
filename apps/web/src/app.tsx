import {
	createBrowserRouter,
	createHashRouter,
	Navigate,
	RouterProvider,
} from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { isAutoMateWebAppPath } from "./lib/automate-resume";
import { PairRoute } from "./routes/pair";
import { SessionRoute } from "./routes/session";
import { WorkspaceRoute } from "./routes/workspace";
import { WorkspacesRoute } from "./routes/workspaces";

const isAutoMateWebApp = isAutoMateWebAppPath(location.pathname);
const isAutoMateRoot =
	isAutoMateWebApp && new URLSearchParams(location.search).has("code");
const protectedRoutes = [
	{ index: true, element: <WorkspacesRoute /> },
	{ path: "w/:workspaceId", element: <WorkspaceRoute /> },
	{ path: "w/:workspaceId/s/:sessionId", element: <SessionRoute /> },
];

const routes = [
	...(isAutoMateRoot ? [{ path: "/", element: <PairRoute /> }] : []),
	{ path: "/pair", element: <PairRoute /> },
	{ path: "/pair/:code/:mailboxId", element: <PairRoute /> },
	{
		element: <AuthGate />,
		children: [
			...protectedRoutes,
			{ path: "r/:resume", children: protectedRoutes },
		],
	},
	{ path: "*", element: <Navigate to="/" replace /> },
];

const router = isAutoMateWebApp
	? createHashRouter(routes)
	: createBrowserRouter([...routes], {
			basename: location.pathname.startsWith("/app") ? "/app" : "/",
		});

export function App() {
	return <RouterProvider router={router} />;
}
