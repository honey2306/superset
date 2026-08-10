import {
	createBrowserRouter,
	Navigate,
	RouterProvider,
} from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { PairRoute } from "./routes/pair";
import { SessionRoute } from "./routes/session";
import { WorkspaceRoute } from "./routes/workspace";
import { WorkspacesRoute } from "./routes/workspaces";

const router = createBrowserRouter(
	[
		{ path: "/pair", element: <PairRoute /> },
		{
			element: <AuthGate />,
			children: [
				{ index: true, element: <WorkspacesRoute /> },
				{ path: "w/:workspaceId", element: <WorkspaceRoute /> },
				{ path: "w/:workspaceId/s/:sessionId", element: <SessionRoute /> },
			],
		},
		{ path: "*", element: <Navigate to="/" replace /> },
	],
	{ basename: "/app" },
);

export function App() {
	return <RouterProvider router={router} />;
}
