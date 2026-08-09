import { useCallback, useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function useAcpForAgentPresets() {
	const utils = electronTrpc.useUtils();
	const { data: useAcpForAgentPresets } =
		electronTrpc.settings.getUseAcpForAgentPresets.useQuery();
	const setUseAcpForAgentPresets =
		electronTrpc.settings.setUseAcpForAgentPresets.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getUseAcpForAgentPresets.cancel();
				const previous = utils.settings.getUseAcpForAgentPresets.getData();
				utils.settings.getUseAcpForAgentPresets.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getUseAcpForAgentPresets.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getUseAcpForAgentPresets.invalidate();
			},
		});

	const { mutateAsync: mutateUseAcpForAgentPresets } = setUseAcpForAgentPresets;
	const toggleChainRef = useRef<Promise<void>>(Promise.resolve());
	const toggleUseAcpForAgentPresets = useCallback(() => {
		toggleChainRef.current = toggleChainRef.current.then(async () => {
			try {
				const current =
					utils.settings.getUseAcpForAgentPresets.getData() ??
					(await utils.settings.getUseAcpForAgentPresets.fetch());
				await mutateUseAcpForAgentPresets({ enabled: !current });
			} catch (error) {
				console.error(
					"[useAcpForAgentPresets] Failed to toggle ACP preset mode",
					error,
				);
			}
		});
	}, [utils, mutateUseAcpForAgentPresets]);

	return {
		useAcpForAgentPresets,
		setUseAcpForAgentPresets,
		toggleUseAcpForAgentPresets,
	};
}
