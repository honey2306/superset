import {
	createBrowserRouter,
	Navigate,
	RouterProvider,
} from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { PairRoute } from "./routes/pair";
import { SessionRoute } from "./routes/session";
import { TerminalRoute } from "./routes/terminal";
import { WorkspaceRoute } from "./routes/workspace";
import { WorkspacesRoute } from "./routes/workspaces";

const automateBasePath = "/webapp/16740";
const isAutoMateWebApp =
	location.pathname === automateBasePath ||
	location.pathname.startsWith(`${automateBasePath}/`);
const isAutoMateRoot =
	isAutoMateWebApp && new URLSearchParams(location.search).has("code");

const router = createBrowserRouter(
	[
		...(isAutoMateRoot ? [{ path: "/", element: <PairRoute /> }] : []),
		{ path: "/pair", element: <PairRoute /> },
		{
			element: <AuthGate />,
			children: [
				{ index: true, element: <WorkspacesRoute /> },
				{ path: "w/:workspaceId", element: <WorkspaceRoute /> },
				{ path: "w/:workspaceId/s/:sessionId", element: <SessionRoute /> },
				{ path: "w/:workspaceId/t/:terminalId", element: <TerminalRoute /> },
			],
		},
		{ path: "*", element: <Navigate to="/" replace /> },
	],
	{
		basename: location.pathname.startsWith("/app")
			? "/app"
			: isAutoMateWebApp
				? automateBasePath
				: "/",
	},
);

export function App() {
	return <RouterProvider router={router} />;
}
