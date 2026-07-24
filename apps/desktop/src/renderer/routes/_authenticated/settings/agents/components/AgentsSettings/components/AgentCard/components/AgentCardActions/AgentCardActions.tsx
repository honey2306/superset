import { Button } from "@superset/ui/button";
import { CardFooter } from "@superset/ui/card";
import { useTranslation } from "renderer/providers/I18nProvider";

interface AgentCardActionsProps {
	isResetting: boolean;
	onReset: () => void;
}

export function AgentCardActions({
	isResetting,
	onReset,
}: AgentCardActionsProps) {
	const { t } = useTranslation();
	return (
		<CardFooter className="mt-2 justify-end">
			<Button variant="outline" onClick={onReset} disabled={isResetting}>
				{t("agents.resetDefaults")}
			</Button>
		</CardFooter>
	);
}
