import type { BrowserWindow } from "electron";
import { z } from "zod";
import { getAgentBrowserManager } from "../../../main/lib/agent-browser/browser-manager";
import { publicProcedure, router } from "..";

const sessionInput = z.object({ sessionId: z.string().min(1) });

export const createAgentBrowserRouter = (
	getWindow: () => BrowserWindow | null,
) => {
	const manager = getAgentBrowserManager(getWindow);
	return router({
		state: publicProcedure.input(sessionInput).query(({ input }) => {
			return manager.getState(input.sessionId);
		}),
		ensurePage: publicProcedure
			.input(sessionInput)
			.mutation(({ input }) => manager.ensurePage(input.sessionId)),
		createPage: publicProcedure
			.input(sessionInput.extend({ url: z.string().optional() }))
			.mutation(({ input }) => manager.createPage(input.sessionId, input.url)),
		selectPage: publicProcedure
			.input(sessionInput.extend({ pageId: z.string().min(1) }))
			.mutation(async ({ input }) => {
				await manager.selectPage(input.sessionId, input.pageId);
			}),
		closePage: publicProcedure
			.input(sessionInput.extend({ pageId: z.string().min(1) }))
			.mutation(async ({ input }) => {
				await manager.closePage(input.sessionId, input.pageId);
			}),
		navigate: publicProcedure
			.input(sessionInput.extend({ url: z.string().min(1) }))
			.mutation(async ({ input }) => {
				await manager.navigate(input.sessionId, input.url);
			}),
		goBack: publicProcedure.input(sessionInput).mutation(({ input }) => {
			manager.goBack(input.sessionId);
		}),
		goForward: publicProcedure.input(sessionInput).mutation(({ input }) => {
			manager.goForward(input.sessionId);
		}),
		reload: publicProcedure.input(sessionInput).mutation(({ input }) => {
			manager.reload(input.sessionId);
		}),
		setSurface: publicProcedure
			.input(
				sessionInput.extend({
					visible: z.boolean(),
					bounds: z
						.object({
							x: z.number().finite(),
							y: z.number().finite(),
							width: z.number().finite().positive(),
							height: z.number().finite().positive(),
						})
						.optional(),
				}),
			)
			.mutation(({ input }) => {
				manager.setSurface(input);
			}),
	});
};

export type AgentBrowserRouter = ReturnType<typeof createAgentBrowserRouter>;
