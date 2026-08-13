import type { AppRouter } from "@superset/host-service";
import { createTRPCReact } from "@trpc/react-query";
import { createContext } from "react";

// Keep the Host client isolated from Electron and workspace tRPC providers.
// createTRPCReact otherwise shares its default React context, so nesting this
// provider would make Electron subscription hooks use the Host's HTTP link.
const hostServiceTrpcContext = createContext(null);

export const hostServiceTrpc = createTRPCReact<AppRouter>({
	abortOnUnmount: true,
	context: hostServiceTrpcContext,
});
