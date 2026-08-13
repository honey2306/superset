import { observable } from "@trpc/server/observable";
import {
	getHostServiceCoordinator,
	type HostServiceStatusEvent,
} from "main/lib/host-service-coordinator";
import { publicProcedure, router } from "../..";
import { getHostServiceSpawnConfig } from "./utils/get-host-service-spawn-config";

export const createHostServiceCoordinatorRouter = () => {
	return router({
		start: publicProcedure.mutation(() => {
			return getHostServiceCoordinator().start(getHostServiceSpawnConfig());
		}),

		getConnection: publicProcedure.query(() => {
			return getHostServiceCoordinator().getConnection();
		}),

		getProcessStatus: publicProcedure.query(() => {
			return { status: getHostServiceCoordinator().getProcessStatus() };
		}),

		restart: publicProcedure.mutation(() => {
			return getHostServiceCoordinator().restart(getHostServiceSpawnConfig());
		}),

		reset: publicProcedure.mutation(() => {
			return getHostServiceCoordinator().reset(getHostServiceSpawnConfig());
		}),

		onStatusChange: publicProcedure.subscription(() => {
			return observable<HostServiceStatusEvent>((emit) => {
				const coordinator = getHostServiceCoordinator();
				const handler = (event: HostServiceStatusEvent) => emit.next(event);
				coordinator.on("status-changed", handler);
				return () => coordinator.off("status-changed", handler);
			});
		}),
	});
};
