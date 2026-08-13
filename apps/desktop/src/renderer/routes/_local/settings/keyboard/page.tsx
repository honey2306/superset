import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { HiMagnifyingGlass } from "react-icons/hi2";
import {
	HOTKEYS,
	type HotkeyCategory,
	type HotkeyId,
	type ShortcutBinding,
	useFormatBinding,
	useHotkeyDisplay,
	useHotkeyOverridesStore,
	useKeyboardPreferencesStore,
	useRecordHotkeys,
} from "renderer/hotkeys";
import { useTranslation } from "renderer/providers/I18nProvider";

const CATEGORY_ORDER: HotkeyCategory[] = [
	"Navigation",
	"Workspace",
	"Terminal",
	"Layout",
	"Window",
	"Help",
];

function HotkeyRow({
	id,
	label,
	description,
	isRecording,
	onStartRecording,
	onReset,
}: {
	id: HotkeyId;
	label: string;
	description?: string;
	isRecording: boolean;
	onStartRecording: () => void;
	onReset: () => void;
}) {
	const { keys } = useHotkeyDisplay(id);
	const { t } = useTranslation();

	return (
		<div
			className={cn(
				"flex items-center justify-between gap-4 py-3 px-4 transition-colors",
				isRecording && "bg-destructive/5",
			)}
		>
			<div className="flex flex-col">
				<span className="text-sm text-fg">{label}</span>
				{description && (
					<span className="text-xs text-fg-mute">{description}</span>
				)}
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onStartRecording}
					className={cn(
						"h-7 px-3 rounded-ds-3 border text-xs transition-colors",
						isRecording
							? "border-destructive/50 bg-destructive/10 text-destructive ring-2 ring-destructive/20"
							: "border-line bg-accent-tint/20 text-fg hover:bg-accent-tint/40",
					)}
				>
					{isRecording ? (
						<span>{t("keyboard.pressKey")}</span>
					) : (
						<KbdGroup>
							{keys.map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</KbdGroup>
					)}
				</button>
				<Button variant="ghost" size="sm" onClick={onReset}>
					{t("keyboard.reset")}
				</Button>
			</div>
		</div>
	);
}

export const Route = createFileRoute("/_local/settings/keyboard/")({
	component: KeyboardShortcutsPage,
});

function getHotkeysByCategory(): Record<
	HotkeyCategory,
	Array<{ id: HotkeyId; label: string; description?: string }>
> {
	const grouped: Record<
		HotkeyCategory,
		Array<{ id: HotkeyId; label: string; description?: string }>
	> = {
		Navigation: [],
		Workspace: [],
		Layout: [],
		Terminal: [],
		Window: [],
		Help: [],
	};
	for (const [id, hotkey] of Object.entries(HOTKEYS)) {
		grouped[hotkey.category as HotkeyCategory].push({
			id: id as HotkeyId,
			label: hotkey.label,
			description: hotkey.description,
		});
	}
	return grouped;
}

const hotkeysByCategory = getHotkeysByCategory();

function KeyboardShortcutsPage() {
	const { t } = useTranslation();
	const [searchQuery, setSearchQuery] = useState("");
	const [recordingId, setRecordingId] = useState<HotkeyId | null>(null);
	const [pendingConflict, setPendingConflict] = useState<{
		targetId: HotkeyId;
		binding: ShortcutBinding;
		conflictId: HotkeyId;
	} | null>(null);

	const resetOverride = useHotkeyOverridesStore((s) => s.resetOverride);
	const resetAll = useHotkeyOverridesStore((s) => s.resetAll);
	const setOverride = useHotkeyOverridesStore((s) => s.setOverride);

	const adaptiveLayoutEnabled = useKeyboardPreferencesStore(
		(s) => s.adaptiveLayoutEnabled,
	);
	const setAdaptiveLayoutEnabled = useKeyboardPreferencesStore(
		(s) => s.setAdaptiveLayoutEnabled,
	);

	useRecordHotkeys(recordingId, {
		// New printable bindings follow the printed character (matches what the
		// user sees on their keyboard). F-keys / named keys are forced to
		// "named" by the recorder regardless of this preference.
		preferredMode: "logical",
		onSave: () => setRecordingId(null),
		onCancel: () => setRecordingId(null),
		onUnassign: () => setRecordingId(null),
		onConflict: (targetId, binding, conflictId) => {
			setPendingConflict({ targetId, binding, conflictId });
			setRecordingId(null);
		},
		onReserved: (_binding, info) => {
			if (info.severity === "error") {
				toast.error(info.reason);
				setRecordingId(null);
			} else {
				toast.warning(info.reason);
			}
		},
	});

	const { keys: showHotkeysKeys } = useHotkeyDisplay("SHOW_HOTKEYS");

	const filteredHotkeysByCategory = useMemo(() => {
		if (!searchQuery) return hotkeysByCategory;
		const lower = searchQuery.toLowerCase();
		return Object.fromEntries(
			CATEGORY_ORDER.map((category) => [
				category,
				(hotkeysByCategory[category] ?? []).filter((hotkey) =>
					hotkey.label.toLowerCase().includes(lower),
				),
			]),
		) as typeof hotkeysByCategory;
	}, [searchQuery]);

	const handleStartRecording = (id: HotkeyId) => {
		setRecordingId((current) => (current === id ? null : id));
	};

	const handleConflictReassign = () => {
		if (!pendingConflict) return;
		setOverride(pendingConflict.conflictId, null);
		setOverride(pendingConflict.targetId, pendingConflict.binding);
		setPendingConflict(null);
	};

	const conflictDisplay = useFormatBinding(pendingConflict?.binding ?? null);

	return (
		<div className="p-6 max-w-4xl w-full">
			{/* Header */}
			<div className="mb-6 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">{t("keyboard.title")}</h2>
					<p className="text-sm text-fg-mute mt-1">
						{t("keyboard.descriptionPrefix")}{" "}
						<KbdGroup>
							{showHotkeysKeys.map((key) => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</KbdGroup>{" "}
						{t("keyboard.descriptionSuffix")}
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						setRecordingId(null);
						resetAll();
					}}
				>
					{t("keyboard.resetAll")}
				</Button>
			</div>

			{/* Preferences */}
			<div className="mb-8 flex items-center justify-between gap-4">
				<div className="space-y-0.5">
					<Label htmlFor="adaptive-layout" className="text-sm font-medium">
						{t("keyboard.adaptiveLayout")}
					</Label>
					<p className="text-xs text-fg-mute">
						{t("keyboard.adaptiveLayoutDescription")}
					</p>
				</div>
				<Switch
					id="adaptive-layout"
					checked={adaptiveLayoutEnabled}
					onCheckedChange={setAdaptiveLayoutEnabled}
				/>
			</div>

			{/* Search */}
			<div className="relative mb-6">
				<HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-mute" />
				<Input
					type="text"
					placeholder={t("dashboard.search")}
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					className="pl-9 bg-accent-tint/30 border-transparent focus:border-accent"
				/>
			</div>

			{/* Tables by Category */}
			<div className="space-y-6">
				{CATEGORY_ORDER.map((category) => {
					const hotkeys = filteredHotkeysByCategory[category] ?? [];
					if (hotkeys.length === 0) return null;

					return (
						<div key={category}>
							<h3 className="text-sm font-medium text-fg-mute mb-2">
								{category}
							</h3>
							<div className="rounded-ds-5 border border-line overflow-hidden divide-y divide-border">
								{hotkeys.map((hotkey) => (
									<HotkeyRow
										key={hotkey.id}
										id={hotkey.id}
										label={hotkey.label}
										description={hotkey.description}
										isRecording={recordingId === hotkey.id}
										onStartRecording={() => handleStartRecording(hotkey.id)}
										onReset={() => {
											setRecordingId((current) =>
												current === hotkey.id ? null : current,
											);
											resetOverride(hotkey.id);
										}}
									/>
								))}
							</div>
						</div>
					);
				})}

				{CATEGORY_ORDER.every(
					(cat) => (filteredHotkeysByCategory[cat] ?? []).length === 0,
				) && (
					<div className="py-8 text-center text-sm text-fg-mute">
						{t("keyboard.noResults", { query: searchQuery })}
					</div>
				)}
			</div>

			{/* Conflict dialog */}
			<AlertDialog
				open={!!pendingConflict}
				onOpenChange={() => setPendingConflict(null)}
			>
				<AlertDialogContent className="max-w-[380px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							{t("keyboard.conflictTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-fg-mute space-y-1.5">
								<span className="block">
									{pendingConflict
										? t("keyboard.conflictDescription", {
												shortcut: conflictDisplay.text,
												action: HOTKEYS[pendingConflict.conflictId].label,
											})
										: ""}
								</span>
								<span className="block">{t("keyboard.reassignQuestion")}</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setPendingConflict(null)}
						>
							{t("common.cancel")}
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onClick={handleConflictReassign}
						>
							{t("keyboard.reassign")}
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
