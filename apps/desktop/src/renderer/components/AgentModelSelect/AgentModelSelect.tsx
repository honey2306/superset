import * as SelectPrimitive from "@radix-ui/react-select";
import type {
	AgentModelOption,
	ModelOptionGroup,
} from "@superset/shared/agent-models";
import {
	getProviderLogoUrl,
	groupModelsByProvider,
} from "@superset/shared/agent-models";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectLabel,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { cn } from "@superset/ui/utils";
import { CheckIcon } from "lucide-react";
import type { ReactNode } from "react";

// Radix Select reserves "" for clearing, so "Default" needs a sentinel.
const DEFAULT_MODEL_VALUE = "__default_model__";

interface AgentModelSelectProps {
	models: AgentModelOption[];
	value: string | null;
	onValueChange: (model: string | null) => void;
	disabled?: boolean;
	/** Shows in the trigger while no option is selected. */
	placeholder?: string;
	/**
	 * Offer a leading "Default" row that maps back to `null`. The
	 * workspace-create flow wants it; settings pickers that require a
	 * concrete model pass `false`.
	 */
	allowDefault?: boolean;
	defaultLabel?: string;
	triggerClassName?: string;
	contentClassName?: string;
}

/**
 * Option row for the model/effort pickers. Rebuilt on Radix primitives
 * instead of the DS `SelectItem` so the selected state reads through an
 * accent check mark on a calm neutral wash — not a filled accent row —
 * with the provider logo leading the label.
 */
function ModelSelectItem({
	value,
	children,
}: {
	value: string;
	children: ReactNode;
}) {
	return (
		<SelectPrimitive.Item
			value={value}
			className={cn(
				"focus:bg-hover data-[state=checked]:bg-hover relative flex h-[30px] w-full cursor-default items-center gap-2 rounded-ds-3 py-0 pr-2.5 pl-2.5 text-xs text-fg outline-hidden select-none transition-colors duration-[80ms]",
				"data-[state=checked]:font-medium",
				"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
			)}
		>
			<SelectPrimitive.ItemText asChild>{children}</SelectPrimitive.ItemText>
			<SelectPrimitive.ItemIndicator className="ml-auto shrink-0">
				<CheckIcon className="size-3.5 text-accent-foreground" />
			</SelectPrimitive.ItemIndicator>
		</SelectPrimitive.Item>
	);
}

function ModelOptionContent({ model }: { model: AgentModelOption }) {
	return (
		<span className="flex min-w-0 items-center gap-2">
			{model.provider ? (
				<img
					alt=""
					className="size-3 shrink-0 object-contain dark:invert"
					src={getProviderLogoUrl(model.provider)}
				/>
			) : null}
			<span className="truncate">{model.label}</span>
		</span>
	);
}

function ModelOptionGroupSection({ group }: { group: ModelOptionGroup }) {
	return (
		<SelectGroup>
			{group.label ? <SelectLabel>{group.label}</SelectLabel> : null}
			{group.models.map((model) => (
				<ModelSelectItem key={model.id} value={model.id}>
					<ModelOptionContent model={model} />
				</ModelSelectItem>
			))}
		</SelectGroup>
	);
}

export function AgentModelSelect({
	models,
	value,
	onValueChange,
	disabled,
	placeholder = "Default",
	allowDefault = true,
	defaultLabel = "Default",
	triggerClassName,
	contentClassName,
}: AgentModelSelectProps) {
	const hasDefaultOption =
		allowDefault && (models.length > 0 || value === null);
	const selectedValue =
		hasDefaultOption &&
		(value === null || !models.some((model) => model.id === value))
			? DEFAULT_MODEL_VALUE
			: (value ?? "");
	const groups = groupModelsByProvider(models);

	const handleValueChange = (nextValue: string) => {
		onValueChange(nextValue === DEFAULT_MODEL_VALUE ? null : nextValue);
	};

	return (
		<Select
			value={selectedValue}
			onValueChange={handleValueChange}
			disabled={disabled}
		>
			<SelectTrigger className={triggerClassName}>
				<SelectValue placeholder={placeholder} />
			</SelectTrigger>
			<SelectContent className={contentClassName}>
				{hasDefaultOption && (
					<ModelSelectItem value={DEFAULT_MODEL_VALUE}>
						<span className="flex min-w-0 items-center gap-2">
							{defaultLabel}
						</span>
					</ModelSelectItem>
				)}
				{hasDefaultOption && groups.length > 0 && <SelectSeparator />}
				{groups.map((group) => (
					<ModelOptionGroupSection
						group={group}
						key={group.label ?? "__default_group__"}
					/>
				))}
			</SelectContent>
		</Select>
	);
}
