import type { HostAgentConfig } from "@superset/host-service/settings";
import type { TerminalPreset } from "@superset/local-db";
import { cn } from "@superset/ui/utils";
import type { RefObject } from "react";
import { useTranslation } from "renderer/providers/I18nProvider";
import { PresetRow } from "../../../PresetRow";
import type { PresetProjectOption } from "../../preset-project-options";

interface PresetsTableProps {
	presets: TerminalPreset[];
	isLoading: boolean;
	projectOptionsById: ReadonlyMap<string, PresetProjectOption>;
	/** v2 host-agent configs, used by PresetRow to resolve the linked-agent icon. */
	agents?: HostAgentConfig[];
	presetsContainerRef: RefObject<HTMLDivElement | null>;
	onEdit: (presetId: string) => void;
	onLocalReorder: (fromIndex: number, toIndex: number) => void;
	onPersistReorder: (presetId: string, targetIndex: number) => void;
	onToggleVisibility: (presetId: string, visible: boolean) => void;
	/** When false, the parent supplies the border. Defaults to true. */
	bordered?: boolean;
}

export function PresetsTable({
	presets,
	isLoading,
	projectOptionsById,
	agents,
	presetsContainerRef,
	onEdit,
	onLocalReorder,
	onPersistReorder,
	onToggleVisibility,
	bordered = true,
}: PresetsTableProps) {
	const { t } = useTranslation();
	return (
		<div
			ref={presetsContainerRef}
			className={cn(
				"divide-y divide-border",
				bordered && "rounded-ds-5 border border-line overflow-hidden",
			)}
		>
			{isLoading ? (
				<div className="py-8 text-center text-sm text-fg-mute">
					{t("terminal.loadingPresets")}
				</div>
			) : presets.length > 0 ? (
				presets.map((preset, index) => (
					<PresetRow
						key={preset.id}
						preset={preset}
						rowIndex={index}
						projectOptionsById={projectOptionsById}
						agents={agents}
						onEdit={onEdit}
						onLocalReorder={onLocalReorder}
						onPersistReorder={onPersistReorder}
						onToggleVisibility={onToggleVisibility}
					/>
				))
			) : (
				<div className="py-10 text-center text-sm text-fg-mute">
					{t("terminal.noPresets")}
				</div>
			)}
		</div>
	);
}
