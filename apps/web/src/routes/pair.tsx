import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { setStoredSession } from "~/lib/auth-store";
import { getTrpc, resetTrpc } from "~/lib/trpc-client";

type PairState =
	| { kind: "idle" }
	| { kind: "pairing" }
	| { kind: "paired" }
	| { kind: "error"; message: string };

export function PairRoute() {
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const initialCode = params.get("code") ?? "";
	const relayMailboxId = params.get("mailboxId") ?? undefined;
	const [code, setCode] = useState(initialCode);
	const [state, setState] = useState<PairState>({ kind: "idle" });

	const redeem = useCallback(
		async (nextCode: string): Promise<void> => {
			if (!nextCode.trim()) {
				setState({ kind: "error", message: "Enter a pairing code." });
				return;
			}
			setState({ kind: "pairing" });
			try {
				resetTrpc();
				const result = await getTrpc().phone.pairing.redeem.mutate({
					code: nextCode.trim().toUpperCase(),
					deviceLabel: navigator.userAgent.slice(0, 64),
				});
				setStoredSession({
					token: result.token,
					sessionId: result.sessionId,
					hostName: result.hostName,
					hostId: result.hostId,
					expiresAt: result.expiresAt,
					relayMailboxId,
				});
				setState({ kind: "paired" });
				setTimeout(() => navigate("/", { replace: true }), 400);
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Pairing failed. Try again.";
				setState({ kind: "error", message });
			}
		},
		[navigate, relayMailboxId],
	);

	useEffect(() => {
		if (initialCode) {
			void redeem(initialCode);
		}
	}, [initialCode, redeem]);

	return (
		<main
			className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-stretch justify-center gap-6 px-6"
			style={{
				paddingTop: "max(var(--safe-area-top), 24px)",
				paddingBottom: "max(var(--safe-area-bottom), 24px)",
			}}
		>
			<header className="text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Pair with Superset
				</h1>
				<p className="mt-2 text-sm text-white/60 dark:text-white/60">
					Enter the code shown in the desktop Settings → Phone access pane.
				</p>
			</header>

			<div className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
				<label
					htmlFor="code"
					className="text-xs font-medium uppercase tracking-wider text-white/60"
				>
					Pairing code
				</label>
				<input
					id="code"
					value={code}
					onChange={(e) => setCode(e.target.value)}
					autoCapitalize="characters"
					autoCorrect="off"
					spellCheck={false}
					inputMode="text"
					placeholder="XXXX-XXXX"
					className="mt-2 block w-full rounded-lg bg-black/30 px-3 py-3 font-mono text-lg tracking-widest text-white outline-none ring-1 ring-white/10 focus:ring-white/40"
				/>
				<button
					type="button"
					disabled={state.kind === "pairing"}
					onClick={() => void redeem(code)}
					className="mt-4 w-full rounded-lg bg-white px-4 py-3 font-medium text-black transition disabled:opacity-50"
				>
					{state.kind === "pairing" ? "Pairing…" : "Pair this phone"}
				</button>
			</div>

			{state.kind === "error" ? (
				<p className="text-center text-sm text-red-400">{state.message}</p>
			) : null}
			{state.kind === "paired" ? (
				<p className="text-center text-sm text-green-400">
					Paired. Taking you in…
				</p>
			) : null}
		</main>
	);
}
