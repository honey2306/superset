import { createFileRoute } from "@tanstack/react-router";
import { PhoneAccessSettings } from "./components/PhoneAccessSettings";

export const Route = createFileRoute("/_local/settings/phone/")({
	component: PhoneSettingsPage,
});

function PhoneSettingsPage() {
	return <PhoneAccessSettings />;
}
