import * as schema from "../../../packages/host-service/src/db/schema";
import { projects as projectRows } from "../../../packages/host-service/src/db/schema";
import "react-mosaic-component";
import { useTabsStore } from "renderer/stores/tabs/store";
import { openFileInPanes } from "../../apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/PanesWorkspace/panesStoreRegistry";
import { createLegacyTerminalPaneBridge } from "../../apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/createLegacyTerminalPaneBridge";

const db = {} as {
	update: (table: unknown) => unknown;
	delete: (table: unknown) => unknown;
};
const updateAlias = db.update;
const { delete: deleteAlias } = db;

updateAlias(projectRows);
deleteAlias(schema.workspaces);

void useTabsStore;
void createLegacyTerminalPaneBridge;
void openFileInPanes;
