import { useCallback, useEffect, useState } from "react";
import {
	useLocation,
	useNavigate,
	useParams,
	useSearchParams,
} from "react-router-dom";
import { getStoredRelayMailboxId, setStoredSession } from "~/lib/auth-store";
import {
	canRedeemPairing,
	getAutoMatePairingMailboxId,
	getPairingCredentials,
} from "~/lib/automate-pairing";
import {
	getAutoMatePairSuccessPath,
	isAutoMateWebAppPath,
} from "~/lib/automate-resume";
import {
	clearPairingAttempt,
	getOrCreatePairingAttempt,
	redeemPairingWithRetry,
} from "~/lib/pairing-attempt";
import {
	AUTOMATE_PAIRING_LINK_REQUIRED_MESSAGE,
	getPairingErrorMessage,
} from "~/lib/pairing-error";
import { isRevokedPairingReason } from "~/lib/pairing-reason";
import { getTrpc, resetTrpc } from "~/lib/trpc-client";

type PairState =
	| { kind: "idle" }
	| {
			kind: "pairing";
			status: "sending" | "retrying" | "timeout";
			attempt: number;
			maxAttempts: number;
	  }
	| { kind: "paired" }
	| { kind: "error"; message: string };

export function PairRoute() {
	const [params] = useSearchParams();
	const pathParams = useParams<{ code: string; mailboxId: string }>();
	const navigate = useNavigate();
	const routeLocation = useLocation();
	const { code: initialCode, mailboxId: routeMailboxId } =
		getPairingCredentials(params, pathParams);
	const isAutoMate = isAutoMateWebAppPath(location.pathname);
	const relayMailboxId = getAutoMatePairingMailboxId({
		isAutoMateWebApp: isAutoMate,
		routeMailboxId,
		storedMailboxId: getStoredRelayMailboxId(),
	});
	const canRedeem = canRedeemPairing({
		isAutoMateWebApp: isAutoMate,
		relayMailboxId,
	});
	const [code, setCode] = useState(initialCode);
	const [state, setState] = useState<PairState>({ kind: "idle" });
	const wasRevoked = isRevokedPairingReason(params, routeLocation.state);

	const redeem = useCallback(
		async (nextCode: string): Promise<void> => {
			if (!canRedeem) {
				setState({
					kind: "error",
					message: AUTOMATE_PAIRING_LINK_REQUIRED_MESSAGE,
				});
				return;
			}
			if (!nextCode.trim()) {
				setState({ kind: "error", message: "Enter a pairing code." });
				return;
			}
			const pairingAttempt = getOrCreatePairingAttempt(nextCode);
			setState({
				kind: "pairing",
				status: "sending",
				attempt: 1,
				maxAttempts: 3,
			});
			try {
				const result = await redeemPairingWithRetry(
					pairingAttempt,
					async ({ code, redeemNonce }) => {
						resetTrpc();
						return getTrpc().phone.pairing.redeem.mutate({
							code,
							redeemNonce,
							deviceLabel: navigator.userAgent.slice(0, 64),
						});
					},
					{
						onStatus: ({ kind, attempt, maxAttempts }) =>
							setState({
								kind: "pairing",
								status: kind === "attempting" ? "sending" : kind,
								attempt,
								maxAttempts,
							}),
					},
				);
				const storedSession = {
					token: result.token,
					sessionId: result.sessionId,
					hostName: result.hostName,
					hostId: result.hostId,
					expiresAt: result.expiresAt,
					relayMailboxId,
				};
				setStoredSession(storedSession);
				clearPairingAttempt(pairingAttempt.code);
				setState({ kind: "paired" });
				setTimeout(() => {
					const resumePath = getAutoMatePairSuccessPath(
						storedSession,
						isAutoMate,
					);
					if (resumePath) window.location.replace(resumePath);
					else navigate("/", { replace: true });
				}, 400);
			} catch (err) {
				setState({ kind: "error", message: getPairingErrorMessage(err) });
			}
		},
		[navigate, canRedeem, isAutoMate, relayMailboxId],
	);

	useEffect(() => {
		if (initialCode && canRedeem) {
			void redeem(initialCode);
		}
	}, [canRedeem, initialCode, redeem]);

	return (
		<main
			className="mobile-pair-page mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-stretch justify-center gap-6 px-6"
			style={{
				paddingTop: "max(var(--safe-area-top), 24px)",
				paddingBottom: "max(var(--safe-area-bottom), 24px)",
			}}
		>
			<header className="text-center">
				<h1 className="text-2xl font-semibold tracking-tight">
					Pair with Superset
				</h1>
				<p className="mobile-muted-text mt-2 text-sm">
					Enter the code shown in the desktop Settings → Phone access pane.
				</p>
			</header>

			{isAutoMate && !relayMailboxId ? (
				<p className="text-center text-sm text-yellow-200" aria-live="polite">
					{AUTOMATE_PAIRING_LINK_REQUIRED_MESSAGE}
				</p>
			) : null}

			{wasRevoked ? (
				<p className="text-center text-sm text-yellow-200" aria-live="polite">
					This phone pairing was revoked from desktop. Pair it again to
					continue.
				</p>
			) : null}

			{canRedeem ? (
				<div className="mobile-surface rounded-2xl p-4">
					<label
						htmlFor="code"
						className="mobile-muted-text text-xs font-medium uppercase tracking-wider"
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
						className="mt-2 block w-full rounded-lg border border-[var(--phone-border)] bg-[var(--phone-bg)] px-3 py-3 font-mono text-lg tracking-widest text-[var(--phone-text)] outline-none focus:border-[var(--phone-focus)]"
					/>
					<button
						type="button"
						disabled={state.kind === "pairing"}
						onClick={() => void redeem(code)}
						className="mobile-primary-button mt-4 w-full px-4 py-3 font-medium transition disabled:opacity-50"
					>
						{state.kind === "pairing"
							? state.status === "timeout"
								? `Timed out; retrying (${state.attempt}/${state.maxAttempts})…`
								: state.status === "retrying"
									? `Retrying (${state.attempt}/${state.maxAttempts})…`
									: "Pairing…"
							: "Pair this phone"}
					</button>
				</div>
			) : null}

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
