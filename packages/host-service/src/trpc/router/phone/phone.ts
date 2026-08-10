import { getHostId, getHostName } from "@superset/shared/host-info";
import { z } from "zod";
import {
	protectedProcedure,
	pskOnlyProcedure,
	publicProcedure,
	router,
} from "../../index";

/**
 * Phone pairing + session lifecycle.
 *
 * `pairing.mint` — desktop hits this (PSK-authed) to obtain a short-lived
 * one-shot code, which it then renders as a QR / URL for the phone to
 * scan.
 *
 * `pairing.redeem` — the phone hits this UNAUTHED (it has no bearer yet)
 * to exchange the code for a 30-day session token. In-service rate
 * limiting + a constant delay on miss make bruteforcing the 40-bit code
 * space in its 60-second window infeasible.
 *
 * `sessions.list` / `sessions.revoke` — PSK-only maintenance the desktop
 * uses to show and revoke paired devices.
 *
 * `me` — reachable from either transport, used by the phone to confirm
 * it's talking to the expected host.
 */
export const phoneRouter = router({
	pairing: router({
		mint: pskOnlyProcedure.mutation(({ ctx }) => {
			return ctx.runtime.phoneAuth.mintPairingCode();
		}),
		redeem: publicProcedure
			.input(
				z.object({
					code: z.string().min(4).max(32),
					deviceLabel: z.string().max(64).optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				const result = await ctx.runtime.phoneAuth.redeemPairingCode(input, {
					remoteAddress: ctx.remoteAddress,
				});
				return {
					...result,
					hostName: getHostName(),
					hostId: getHostId(),
				};
			}),
	}),
	sessions: router({
		list: pskOnlyProcedure.query(({ ctx }) => {
			return ctx.runtime.phoneAuth.listSessions();
		}),
		revoke: pskOnlyProcedure
			.input(z.object({ sessionId: z.string().min(1) }))
			.mutation(({ ctx, input }) => {
				ctx.runtime.phoneAuth.revoke(input.sessionId);
				return { revoked: true } as const;
			}),
	}),
	me: protectedProcedure.query(({ ctx }) => ({
		hostId: getHostId(),
		hostName: getHostName(),
		authKind: ctx.authKind,
	})),
});
