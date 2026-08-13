import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
} from "react";
import { LOCAL_HOST_SCOPE_ID } from "shared/constants";
import {
	getLocalProductStateCollections,
	type LocalProductStateCollections,
	preloadLocalProductState,
} from "./collections";

const LocalProductStateContext =
	createContext<LocalProductStateCollections | null>(null);

export function LocalProductStateProvider({
	children,
}: {
	children: ReactNode;
}) {
	const collections = useMemo(
		() => getLocalProductStateCollections(LOCAL_HOST_SCOPE_ID),
		[],
	);

	useEffect(() => {
		void preloadLocalProductState(LOCAL_HOST_SCOPE_ID).catch((error) => {
			console.error(
				"[local-product-state] Failed to preload local state:",
				error,
			);
		});
	}, []);

	return (
		<LocalProductStateContext.Provider value={collections}>
			{children}
		</LocalProductStateContext.Provider>
	);
}

export function useLocalCollections(): LocalProductStateCollections {
	const context = useContext(LocalProductStateContext);
	if (!context) {
		throw new Error(
			"useLocalCollections must be used within LocalProductStateProvider",
		);
	}
	return context;
}
