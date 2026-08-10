import { useTranslation } from "renderer/providers/I18nProvider";

interface FileMentionChipProps {
	relativePath: string;
	disabled?: boolean;
	onClick: () => void;
}

export function FileMentionChip({
	relativePath,
	disabled,
	onClick,
}: FileMentionChipProps) {
	const { t } = useTranslation();
	return (
		<button
			type="button"
			className="mx-0.5 inline-flex items-center gap-0.5 rounded-ds-3 bg-accent-tint px-1.5 py-0.5 font-mono text-xs text-accent-solid transition-colors hover:bg-accent-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-line disabled:cursor-default disabled:opacity-60"
			onClick={onClick}
			disabled={disabled}
			aria-label={t("chat.fileMention.openFile", { path: relativePath })}
		>
			<span className="font-semibold text-accent-solid">@</span>
			<span className="text-accent-solid/95">{relativePath}</span>
		</button>
	);
}
