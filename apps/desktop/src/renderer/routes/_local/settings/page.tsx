import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_local/settings/")({
	component: SettingsPage,
});

function SettingsPage() {
	return <Navigate to="/settings/appearance" replace />;
}
