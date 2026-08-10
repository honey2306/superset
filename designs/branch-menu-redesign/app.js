(() => {
	const root = document.documentElement;

	// ---------------- Theme switch ----------------
	const themeSwitch = document.getElementById("themeSwitch");
	const applyTheme = (name) => {
		root.setAttribute("data-theme", name);
		themeSwitch.querySelectorAll("button").forEach((btn) => {
			btn.classList.toggle("is-active", btn.dataset.theme === name);
		});
		try {
			localStorage.setItem("branchMenuTheme", name);
		} catch {}
	};
	themeSwitch.addEventListener("click", (e) => {
		const btn = e.target.closest("button[data-theme]");
		if (btn) applyTheme(btn.dataset.theme);
	});
	try {
		const saved = localStorage.getItem("branchMenuTheme");
		if (saved) applyTheme(saved);
	} catch {}

	// ---------------- State switch ----------------
	// States affect ALL three variants simultaneously so you can compare like-for-like.
	const stateSwitch = document.getElementById("stateSwitch");
	const variants = document.querySelectorAll(".variant");

	const clearOverlays = () => {
		document
			.querySelectorAll(
				"[data-menu], [data-dialog], [data-empty], [data-menu-c]",
			)
			.forEach((el) => {
				el.classList.add("hidden");
			});
	};

	const showState = (state) => {
		stateSwitch.querySelectorAll("button").forEach((b) => {
			b.classList.toggle("is-active", b.dataset.state === state);
		});
		clearOverlays();

		if (state === "menu") {
			// Show the floating "more actions" menu inside each variant
			variants.forEach((v) => {
				v.querySelectorAll("[data-menu], [data-menu-c]").forEach((el) => {
					el.classList.remove("hidden");
				});
			});
		} else if (state === "delete") {
			variants.forEach((v) => {
				v.querySelectorAll("[data-dialog]").forEach((el) => {
					el.classList.remove("hidden");
				});
			});
		} else if (state === "empty") {
			variants.forEach((v) => {
				v.querySelectorAll("[data-empty]").forEach((el) => {
					el.classList.remove("hidden");
				});
			});
		}
		try {
			localStorage.setItem("branchMenuState", state);
		} catch {}
	};

	stateSwitch.addEventListener("click", (e) => {
		const btn = e.target.closest("button[data-state]");
		if (btn) showState(btn.dataset.state);
	});
	try {
		const saved = localStorage.getItem("branchMenuState");
		if (saved) showState(saved);
	} catch {}

	// ---------------- In-variant interactions ----------------
	// Clicking `data-open="dialog-a"` etc. shows only that overlay (leaves state switch alone)
	document.addEventListener("click", (e) => {
		const opener = e.target.closest("[data-open]");
		if (opener) {
			const key = opener.dataset.open;
			// key format: "menu-a" | "dialog-a" | "menu-b" | "dialog-b" | ...
			if (key.startsWith("menu-")) {
				const letter = key.split("-")[1];
				const variant = document.querySelector(
					`.variant[data-variant="${letter}"]`,
				);
				if (variant) {
					variant
						.querySelectorAll("[data-menu], [data-menu-c]")
						.forEach((el) => {
							el.classList.remove("hidden");
						});
				}
				e.stopPropagation();
				return;
			}
			if (key.startsWith("dialog-")) {
				const letter = key.split("-")[1];
				const variant = document.querySelector(
					`.variant[data-variant="${letter}"]`,
				);
				if (variant) {
					variant.querySelectorAll("[data-dialog]").forEach((el) => {
						el.classList.remove("hidden");
					});
				}
				e.stopPropagation();
				return;
			}
		}

		const closer = e.target.closest("[data-close-dialog]");
		if (closer) {
			closer.closest(".dialog-backdrop")?.classList.add("hidden");
			return;
		}

		// Click outside a menu closes it
		if (!e.target.closest("[data-menu], [data-menu-c]")) {
			// Only auto-close menus if we're not in the "menu" state (which pins them)
			const activeState =
				stateSwitch.querySelector("button.is-active")?.dataset.state;
			if (activeState !== "menu") {
				document
					.querySelectorAll("[data-menu], [data-menu-c]")
					.forEach((el) => {
						el.classList.add("hidden");
					});
			}
		}
	});
})();
