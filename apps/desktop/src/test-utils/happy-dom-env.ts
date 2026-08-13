/**
 * Process-wide, idempotent Happy DOM registration for the renderer tests that
 * need a real DOM (`@testing-library/react`'s `render`/`screen`).
 *
 * Why this exists: `@testing-library/dom`'s `screen` is bound to `document.body`
 * at import time (see `@testing-library/dom/dist/screen.js` — `const screen =
 * ... document.body ? getQueriesForElement(document.body, ...)`). Two test files
 * each used to call `GlobalRegistrator.register()` in `beforeAll` and
 * `unregister()` in `afterAll`. Because Bun runs every test file in a single
 * process and `unregister()` closes the underlying Happy DOM instance, the
 * second file's `screen` queries (and the DnD/context-menu tests in
 * `PanesPresetBarItem`) were left pointing at a closed document, failing with
 * an empty `<body />`. Registering once for the whole process and never
 * unregistering mid-suite keeps a single stable DOM that every file shares.
 */
export async function ensureHappyDom(): Promise<void> {
	const { GlobalRegistrator } = await import("@happy-dom/global-registrator");
	// `isRegistered` is shared state on the GlobalRegistrator singleton, so the
	// first file to reach this registers and every other file is a no-op.
	// `register()` is synchronous, so there is no interleaving race between the
	// `isRegistered` check and the registration within a single microtask.
	if (!GlobalRegistrator.isRegistered) {
		GlobalRegistrator.register();
	}
}
