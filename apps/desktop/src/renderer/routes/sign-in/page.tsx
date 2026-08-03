import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-in/")({
	component: SignInRedirect,
});

const workspaceRedirect = <Navigate to="/workspace" replace />;

function SignInRedirect() {
	return workspaceRedirect;
}
