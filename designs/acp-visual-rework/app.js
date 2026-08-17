(() => {
	const tabs = document.querySelectorAll(".shell-tab");
	const stage = document.getElementById("stage");
	const tpl = document.getElementById("tpl-pane");
	const themeSelect = document.getElementById("theme-select");

	function mount(variant) {
		stage.innerHTML = "";
		const frag = tpl.content.cloneNode(true);
		const pane = frag.querySelector(".acp-pane");
		pane.setAttribute("data-variant", variant);
		stage.appendChild(frag);
	}

	tabs.forEach((tab) => {
		tab.addEventListener("click", () => {
			tabs.forEach((t) => t.removeAttribute("data-active"));
			tab.setAttribute("data-active", "true");
			mount(tab.dataset.variant);
		});
	});

	themeSelect.addEventListener("change", () => {
		document.documentElement.setAttribute("data-theme", themeSelect.value);
	});

	document.addEventListener("keydown", (e) => {
		if (["a", "b", "c", "d", "e", "f"].includes(e.key.toLowerCase())) {
			const target = document.querySelector(
				`.shell-tab[data-variant="${e.key.toLowerCase()}"]`,
			);
			if (target) target.click();
		}
	});

	mount("a");
})();
