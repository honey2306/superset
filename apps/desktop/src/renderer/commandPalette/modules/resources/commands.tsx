import { HiOutlineCpuChip } from "react-icons/hi2";
import type { Command } from "../../core/types";
import { ResourcesFrame } from "../../ui/ResourcesFrame/ResourcesFrame";

export const checkResourcesCommand: Command = {
	id: "resources.check",
	title: "Check resources",
	section: "actions",
	icon: HiOutlineCpuChip,
	hotkeyId: "CHECK_RESOURCES",
	keywords: ["resources", "memory", "cpu", "ram", "usage", "monitor"],
	renderFrame: () => <ResourcesFrame />,
};
