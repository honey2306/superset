import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { HiOutlineComputerDesktop, HiOutlineServer } from "react-icons/hi2";
import { useTranslation } from "renderer/providers/I18nProvider";

export interface HostSelectOption {
	id: string;
	name: string;
	isLocal: boolean;
	isOnline: boolean;
}

interface HostSelectProps {
	value: string;
	options: HostSelectOption[];
	onValueChange: (id: string) => void;
	align?: "start" | "end";
	className?: string;
}

export function HostSelect({
	value,
	options,
	onValueChange,
	align = "end",
	className,
}: HostSelectProps) {
	const { t } = useTranslation();
	const selected = options.find((option) => option.id === value);

	return (
		<Select value={value} onValueChange={onValueChange}>
			<SelectTrigger
				size="sm"
				className={`h-8 gap-1.5 px-2 text-fg ${className ?? ""}`}
			>
				<SelectValue>
					<span className="flex items-center gap-1.5">
						<span className="truncate">
							{selected?.isLocal
								? t("project.thisDevice")
								: (selected?.name ?? value)}
						</span>
						{selected && !selected.isLocal && (
							<span
								title={
									selected.isOnline ? t("hosts.online") : t("hosts.offline")
								}
								className={
									selected.isOnline
										? "size-1.5 shrink-0 rounded-full bg-success-tint"
										: "size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
								}
							/>
						)}
					</span>
				</SelectValue>
			</SelectTrigger>
			<SelectContent align={align}>
				{options.map((option) => (
					<SelectItem key={option.id} value={option.id}>
						<span className="flex items-center gap-2">
							{option.isLocal ? (
								<HiOutlineComputerDesktop className="size-4 text-fg-mute" />
							) : (
								<HiOutlineServer className="size-4 text-fg-mute" />
							)}
							<span className="truncate">
								{option.isLocal ? t("project.thisDevice") : option.name}
							</span>
							{!option.isLocal && !option.isOnline && (
								<span className="text-xs text-fg-mute">offline</span>
							)}
						</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
