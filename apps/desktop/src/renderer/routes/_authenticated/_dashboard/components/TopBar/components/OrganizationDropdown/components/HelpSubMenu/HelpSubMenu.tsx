import { COMPANY } from "@superset/shared/constants";
import {
	DropdownMenuItem,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@superset/ui/dropdown-menu";
import { useNavigate } from "@tanstack/react-router";
import { FaDiscord, FaGithub, FaXTwitter } from "react-icons/fa6";
import {
	HiOutlineBookOpen,
	HiOutlineChatBubbleLeftRight,
	HiOutlineEnvelope,
	HiOutlineQuestionMarkCircle,
} from "react-icons/hi2";
import { IoBugOutline } from "react-icons/io5";
import { LuKeyboard, LuMegaphone } from "react-icons/lu";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useTranslation } from "renderer/providers/I18nProvider";

interface HelpSubMenuProps {
	onSubmitPrompt: () => void;
}

export function HelpSubMenu({ onSubmitPrompt }: HelpSubMenuProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const shortcutsHotkey = useHotkeyDisplay("SHOW_HOTKEYS").text;
	const openUrlMutation = electronTrpc.external.openUrl.useMutation();

	const openExternal = (url: string) => {
		openUrlMutation.mutate(url);
	};

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<HiOutlineQuestionMarkCircle className="h-4 w-4" />
				<span>{t("dashboard.help")}</span>
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent className="w-56">
				<DropdownMenuItem onSelect={onSubmitPrompt}>
					<LuMegaphone className="h-4 w-4" />
					{t("dashboard.submitPrompt")}
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={() => openExternal(COMPANY.DOCS_URL)}>
					<HiOutlineBookOpen className="h-4 w-4" />
					{t("navigation.documentation")}
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => navigate({ to: "/settings/keyboard" })}
				>
					<LuKeyboard className="h-4 w-4" />
					{t("keyboard.title")}
					{shortcutsHotkey !== "Unassigned" && (
						<DropdownMenuShortcut>{shortcutsHotkey}</DropdownMenuShortcut>
					)}
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => openExternal(COMPANY.REPORT_ISSUE_URL)}
				>
					<IoBugOutline className="h-4 w-4" />
					{t("dashboard.reportIssue")}
				</DropdownMenuItem>
				<DropdownMenuSub>
					<DropdownMenuSubTrigger>
						<HiOutlineChatBubbleLeftRight className="h-4 w-4" />
						{t("dashboard.contactUs")}
					</DropdownMenuSubTrigger>
					<DropdownMenuSubContent sideOffset={8} className="w-56">
						<DropdownMenuItem onSelect={() => openExternal(COMPANY.GITHUB_URL)}>
							<FaGithub className="h-4 w-4" />
							GitHub
						</DropdownMenuItem>
						<DropdownMenuItem
							onSelect={() => openExternal(COMPANY.DISCORD_URL)}
						>
							<FaDiscord className="h-4 w-4" />
							Discord
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => openExternal(COMPANY.X_URL)}>
							<FaXTwitter className="h-4 w-4" />X
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => openExternal(COMPANY.MAIL_TO)}>
							<HiOutlineEnvelope className="h-4 w-4" />
							{t("dashboard.emailSupport")}
						</DropdownMenuItem>
					</DropdownMenuSubContent>
				</DropdownMenuSub>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}
