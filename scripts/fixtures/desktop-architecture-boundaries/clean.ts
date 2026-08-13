import { projects } from "../../../packages/host-service/src/db/schema";
import { PanesWorkspace } from "../../apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/PanesWorkspace";

function readOnly(table: unknown): void {
	void table;
}

readOnly(projects);
void PanesWorkspace;
