import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_local/providers/LocalHostServiceProvider";
import { PairingQrCode } from "./components/PairingQrCode";
import { buildAutoMatePairingUrl } from "./pairing-url";

export function PhoneAccessSettings() {
	const { activeHostUrl } = useLocalHostService();

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

	const automateUrl =
		mint.data && hostInfo.data?.relayMailboxId
			? buildAutoMatePairingUrl(mint.data.code, hostInfo.data.relayMailboxId)
			: null;
	const relayAvailable = Boolean(hostInfo.data?.relayMailboxId);

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-8">
			<header>
				<h1 className="text-2xl font-semibold">Phone access</h1>
				<p className="mt-1 text-sm text-fg-mute">
					Pair a phone through the AutoMate relay. Your desktop host remains
					available only on this Mac.
				</p>
			</header>

			<section className="flex flex-col gap-3 rounded-ds-5 border p-4">
				<h2 className="text-sm font-medium">Pair a new phone</h2>
				{hostInfo.isLoading ? (
					<div className="text-sm text-fg-mute">
						Checking AutoMate relay configuration…
					</div>
				) : null}
				{!hostInfo.isLoading && !relayAvailable ? (
					<div className="text-sm text-destructive">
						AutoMate relay is unavailable. This desktop build is missing relay
						configuration; phone pairing cannot be generated.
					</div>
				) : null}

				<button
					type="button"
					disabled={!trpc || !relayAvailable || mint.isPending}
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

				{mint.data && automateUrl ? (
					<div className="mt-2 flex flex-col gap-3 rounded border bg-hover/40 p-3 sm:flex-row sm:items-start">
						<div className="shrink-0 self-center sm:self-start">
							<PairingQrCode url={automateUrl} size={192} />
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
								{automateUrl}
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
