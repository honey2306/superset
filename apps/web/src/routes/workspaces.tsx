import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearStoredSession, getStoredSession } from "~/lib/auth-store";
import { getTrpc, isUnauthorized, resetTrpc } from "~/lib/trpc-client";

type Snapshot = Awaited<
	ReturnType<
		ReturnType<typeof getTrpc>["workspaceCatalog"]["snapshot"]["query"]
	>
>;
type Project = Snapshot["projects"][number];
type Workspace = Snapshot["workspaces"][number];

export function WorkspacesRoute() {
	const navigate = useNavigate();
	const session = getStoredSession();
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const snap = await getTrpc().workspaceCatalog.snapshot.query();
				if (cancelled) return;
				setSnapshot(snap);
			} catch (err) {
				if (cancelled) return;
				if (isUnauthorized(err)) {
					clearStoredSession();
					resetTrpc();
					navigate("/pair", { replace: true });
					return;
				}
				setError(err instanceof Error ? err.message : "Failed to load");
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [navigate]);

	const projectMap = new Map<string, Project>();
	for (const p of snapshot?.projects ?? []) projectMap.set(p.id, p);
	const grouped = new Map<
		string,
		{ project: Project; workspaces: Workspace[] }
	>();
	for (const w of snapshot?.workspaces ?? []) {
		const project = projectMap.get(w.projectId);
		if (!project) continue;
		const existing = grouped.get(project.id);
		if (existing) {
			existing.workspaces.push(w);
		} else {
			grouped.set(project.id, { project, workspaces: [w] });
		}
	}

	return (
		<main
			className="mx-auto w-full max-w-md px-4"
			style={{
				paddingTop: "max(var(--safe-area-top), 16px)",
				paddingBottom: "max(var(--safe-area-bottom), 16px)",
			}}
		>
			<header className="mb-4 flex items-center justify-between">
				<div>
					<h1 className="text-lg font-semibold">Workspaces</h1>
					<p className="text-xs text-white/50">{session?.hostName}</p>
				</div>
				<button
					type="button"
					onClick={() => {
						clearStoredSession();
						resetTrpc();
						navigate("/pair", { replace: true });
					}}
					className="text-xs text-white/60 underline"
				>
					Unpair
				</button>
			</header>

			{error ? (
				<div className="rounded-md bg-red-500/10 p-3 text-sm text-red-300 ring-1 ring-red-500/20">
					{error}
				</div>
			) : null}

			{snapshot === null && !error ? (
				<div className="text-sm text-white/60">Loading…</div>
			) : null}

			<div className="flex flex-col gap-4">
				{Array.from(grouped.values()).map(({ project, workspaces }) => (
					<section
						key={project.id}
						className="rounded-2xl bg-white/5 p-3 ring-1 ring-white/10"
					>
						<h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wider text-white/60">
							{project.name || project.repoPath}
						</h2>
						<ul className="flex flex-col gap-1">
							{workspaces.map((w) => (
								<li key={w.id}>
									<Link
										to={`/w/${encodeURIComponent(w.id)}`}
										className="flex items-center justify-between rounded-lg px-3 py-3 hover:bg-white/5 active:bg-white/10"
									>
										<div className="min-w-0">
											<div className="truncate text-sm">
												{w.name || w.branch}
											</div>
											<div className="truncate text-xs text-white/50">
												{w.branch}
											</div>
										</div>
										<span className="text-white/40">›</span>
									</Link>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>
		</main>
	);
}
