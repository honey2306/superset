import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useCallback, useState } from "react";
import {
	HiEllipsisHorizontal,
	HiEye,
	HiEyeSlash,
	HiLockClosed,
	HiOutlineCodeBracket,
} from "react-icons/hi2";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useTranslation } from "renderer/providers/I18nProvider";

interface SecretRowProps {
	secret: {
		id: string;
		key: string;
		value: string;
		sensitive: boolean;
		createdAt: Date;
		updatedAt: Date;
		createdBy: { id: string; name: string; image: string | null } | null;
	};
	organizationId: string;
	onEdit: () => void;
	onDeleted: () => void;
}

export function SecretRow({
	secret,
	organizationId,
	onEdit,
	onDeleted,
}: SecretRowProps) {
	const { locale, t } = useTranslation();
	const [isRevealed, setIsRevealed] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const [valueHovered, setValueHovered] = useState(false);

	const handleDelete = useCallback(async () => {
		if (!confirm(t("secrets.deleteConfirm", { key: secret.key }))) return;
		setIsDeleting(true);
		try {
			await apiTrpcClient.project.secrets.delete.mutate({
				id: secret.id,
				organizationId,
			});
			onDeleted();
		} catch (err) {
			console.error("[secrets/delete] Failed to delete:", err);
		} finally {
			setIsDeleting(false);
		}
	}, [secret.id, secret.key, organizationId, onDeleted, t]);

	const { copyToClipboard, copied } = useCopyToClipboard(1500);
	const handleCopy = useCallback(() => {
		copyToClipboard(secret.value);
	}, [secret.value, copyToClipboard]);

	const isEmpty = !secret.sensitive && !secret.value;

	return (
		<div
			className={cn(
				"flex items-center px-4 py-4 border-b last:border-b-0 group hover:bg-accent-tint/30 transition-colors",
				isDeleting && "opacity-50 pointer-events-none",
			)}
		>
			<div className="flex items-center justify-center size-9 rounded-full border bg-background shrink-0">
				{secret.sensitive ? (
					<HiLockClosed className="h-4 w-4 text-fg-mute" />
				) : (
					<HiOutlineCodeBracket className="h-4 w-4 text-fg-mute" />
				)}
			</div>

			<div className="flex items-center gap-2 min-w-0 flex-1 basis-0 ml-3">
				<span className="font-mono font-semibold text-sm truncate">
					{secret.key}
				</span>
				{secret.sensitive && (
					<span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-hover text-fg-mute shrink-0">
						{t("secrets.sensitive")}
					</span>
				)}
			</div>

			<div className="flex items-center gap-1.5 shrink-0">
				{!secret.sensitive &&
					(isEmpty ? (
						<span className="text-sm text-fg-mute italic">
							{t("secrets.empty")}
						</span>
					) : (
						<>
							<button
								type="button"
								onClick={() => setIsRevealed(!isRevealed)}
								className="text-fg-mute hover:text-fg transition-colors p-1"
							>
								{isRevealed ? (
									<HiEyeSlash className="h-4 w-4" />
								) : (
									<HiEye className="h-4 w-4" />
								)}
							</button>
							{isRevealed ? (
								<Tooltip open={valueHovered}>
									<TooltipTrigger asChild>
										<button
											type="button"
											onClick={handleCopy}
											onMouseEnter={() => setValueHovered(true)}
											onMouseLeave={() => setValueHovered(false)}
											className="font-mono text-sm text-fg-mute max-w-[200px] truncate rounded px-1 py-0.5 hover:bg-accent-tint transition-colors cursor-pointer"
										>
											{secret.value}
										</button>
									</TooltipTrigger>
									<TooltipContent>
										{copied ? t("common.copied") : t("secrets.clickToCopy")}
									</TooltipContent>
								</Tooltip>
							) : (
								<span className="font-mono text-sm text-fg-mute max-w-[200px] truncate">
									{
										"\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
									}
								</span>
							)}
						</>
					))}
			</div>

			<div className="flex items-center justify-end gap-2 flex-1 basis-0 text-xs text-fg-mute">
				<span>
					{t("secrets.addedOn", {
						date: new Intl.DateTimeFormat(locale, {
							month: "short",
							day: "numeric",
						}).format(new Date(secret.createdAt)),
					})}
				</span>
				{secret.createdBy && (
					<Avatar
						size="xs"
						fullName={secret.createdBy.name}
						image={secret.createdBy.image}
					/>
				)}
			</div>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
						<HiEllipsisHorizontal className="h-4 w-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					{!secret.sensitive && (
						<DropdownMenuItem onClick={onEdit}>
							{t("secrets.edit")}
						</DropdownMenuItem>
					)}
					<DropdownMenuItem
						onClick={handleDelete}
						className="text-destructive focus:text-destructive"
					>
						{t("common.delete")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
