import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { PairingQrCode } from "./components/PairingQrCode";

const PAIR_HOSTNAME_KEY = "superset.phone.pair-hostname.v1";

type HostnameChoice = { kind: "auto" } | { kind: "manual"; value: string };

function loadHostnameChoice(): HostnameChoice {
	if (typeof localStorage === "undefined") return { kind: "auto" };
	const raw = localStorage.getItem(PAIR_HOSTNAME_KEY);
	if (!raw) return { kind: "auto" };
	try {
		const parsed = JSON.parse(raw) as HostnameChoice;
		if (parsed.kind === "auto" || parsed.kind === "manual") return parsed;
	} catch {}
	return { kind: "auto" };
}

function saveHostnameChoice(choice: HostnameChoice): void {
	localStorage.setItem(PAIR_HOSTNAME_KEY, JSON.stringify(choice));
}

export function PhoneAccessSettings() {
	const { activeHostUrl } = useLocalHostService();
	const [choice, setChoice] = useState<HostnameChoice>(() =>
		loadHostnameChoice(),
	);
	const [manualInput, setManualInput] = useState(() =>
		choice.kind === "manual" ? choice.value : "",
	);

	useEffect(() => saveHostnameChoice(choice), [choice]);

	const trpc = useMemo(
		() => (activeHostUrl ? getHostServiceClientByUrl(activeHostUrl) : null),
		[activeHostUrl],
	);

	const hostInfo = useQuery({
		queryKey: ["host", "info", activeHostUrl],
		enabled: !!trpc,
		queryFn: () => trpc?.host.info.query(),
	});

	const sessions = useQuery({
		queryKey: ["phone", "sessions", "list", activeHostUrl],
		enabled: !!trpc,
		queryFn: () => trpc?.phone.sessions.list.query(),
		refetchInterval: 10_000,
	});

	const mint = useMutation({
		mutationFn: async () => {
			if (!trpc) throw new Error("host offline");
			return await trpc.phone.pairing.mint.mutate();
		},
	});

	const revoke = useMutation({
		mutationFn: async (sessionId: string) => {
			if (!trpc) throw new Error("host offline");
			return await trpc.phone.sessions.revoke.mutate({ sessionId });
		},
		onSuccess: () => sessions.refetch(),
	});

	const resolvedHostname =
		choice.kind === "manual"
			? choice.value
			: `${(hostInfo.data?.hostName ?? "").replace(/\.local\.?$/i, "")}.local`;

	const pairingOrigin = useMemo(() => {
		if (!activeHostUrl || !resolvedHostname.trim()) return null;
		try {
			const endpoint = new URL(activeHostUrl);
			endpoint.hostname = resolvedHostname.trim();
			return endpoint.origin;
		} catch {
			return null;
		}
	}, [activeHostUrl, resolvedHostname]);
	const url =
		mint.data && pairingOrigin
			? `${pairingOrigin}/app/pair?code=${encodeURIComponent(mint.data.code)}`
			: null;

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
			<header>
				<h1 className="text-2xl font-semibold">Phone access</h1>
				<p className="mt-1 text-sm text-fg-mute">
					Pair a phone browser over your local network or Tailscale. Requires
					<code className="mx-1 rounded bg-hover px-1 py-[1px] text-xs">
						SUPERSET_ACP_SESSIONS=1
					</code>
					on this host.
				</p>
			</header>

			<section className="flex flex-col gap-3 rounded-ds-5 border p-4">
				<h2 className="text-sm font-medium">Pair a new phone</h2>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="radio"
						checked={choice.kind === "auto"}
						onChange={() => setChoice({ kind: "auto" })}
					/>
					<span>Auto ({hostInfo.data?.hostName ?? "…"}.local)</span>
				</label>
				<label className="flex items-center gap-2 text-sm">
					<input
						type="radio"
						checked={choice.kind === "manual"}
						onChange={() =>
							setChoice({ kind: "manual", value: manualInput.trim() })
						}
					/>
					<span>Manual hostname / IP:</span>
					<input
						type="text"
						value={manualInput}
						onChange={(e) => {
							setManualInput(e.target.value);
							if (choice.kind === "manual") {
								setChoice({ kind: "manual", value: e.target.value.trim() });
							}
						}}
						placeholder="mac.tail-abc.ts.net"
						className="flex-1 rounded border px-2 py-1 text-sm"
					/>
				</label>

				<button
					type="button"
					disabled={!trpc || mint.isPending || !resolvedHostname.trim()}
					onClick={() => mint.mutate()}
					className="mt-2 self-start rounded-ds-3 bg-accent-solid px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
				>
					{mint.isPending ? "Generating…" : "Generate pairing code"}
				</button>

				{mint.error ? (
					<div className="text-sm text-destructive">
						{mint.error instanceof Error
							? mint.error.message
							: "Failed to mint code."}
					</div>
				) : null}

				{mint.data && url ? (
					<div className="mt-2 flex flex-col gap-3 rounded border bg-hover/40 p-3 sm:flex-row sm:items-start">
						<div className="shrink-0 self-center sm:self-start">
							<PairingQrCode url={url} size={192} />
						</div>
						<div className="flex min-w-0 flex-1 flex-col gap-2">
							<div className="text-xs uppercase tracking-wider text-fg-mute">
								Pairing code (expires in 60s)
							</div>
							<div className="select-text cursor-text font-mono text-2xl tracking-widest">
								{mint.data.code}
							</div>
							<div className="text-xs text-fg-mute">Or open on phone:</div>
							<div className="select-text cursor-text break-all rounded bg-background p-2 font-mono text-xs">
								{url}
							</div>
						</div>
					</div>
				) : null}
			</section>

			<section className="flex flex-col gap-2 rounded-ds-5 border p-4">
				<h2 className="text-sm font-medium">Paired devices</h2>
				{sessions.data && sessions.data.length === 0 ? (
					<div className="text-sm text-fg-mute">No phones paired yet.</div>
				) : null}
				<ul className="flex flex-col gap-1">
					{sessions.data?.map((s) => (
						<li
							key={s.id}
							className="flex items-center justify-between rounded border px-3 py-2 text-sm"
						>
							<div className="min-w-0">
								<div className="truncate">{s.deviceLabel || s.id}</div>
								<div className="text-xs text-fg-mute">
									Last seen {new Date(s.lastSeenAt).toLocaleString()}
								</div>
							</div>
							<button
								type="button"
								onClick={() => revoke.mutate(s.id)}
								className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
							>
								Revoke
							</button>
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
