/**
 * Renders the 5 banner variants + boot logs into Banner Variants.html.
 * Reads FONTS from fonts.js and wires up the top Agent-name switcher.
 */
(function init() {
	const bootLinesFor = (agent) => [
		{ tone: "green", text: `Agent connected · ${agent}` },
		{ tone: "green", text: "Model loaded · claude-opus-4-7" },
		{ tone: "cyan", text: "Workspace mounted · superset" },
		{ tone: "cyan", text: "Git status checked" },
		{ tone: "purple", text: "ACP session initialized" },
		{ tone: "purple", text: "Permissions armed" },
		{ tone: "pink", text: "Ready." },
	];

	function renderBanner(fontKey, text) {
		const font = FONTS[fontKey];
		if (!font) return "";
		const chars = text.toUpperCase().split("");
		const rows = [];
		for (let r = 0; r < font.rows; r++) {
			let row = "";
			for (const c of chars) {
				const glyph = font.glyphs[c] || font.glyphs["?"];
				if (glyph) row += glyph[r];
			}
			rows.push(row.trimEnd());
		}
		return rows.join("\n");
	}

	function renderBoot(el, agent) {
		const lines = bootLinesFor(agent);
		const html =
			lines
				.map(
					(l) => `
					<div class="boot-line" data-tone="${l.tone}">
						<span class="boot-check">[✓]</span><span>${l.text}</span>
					</div>
				`,
				)
				.join("") +
			`
			<div class="boot-cursor"><span>&rsaquo;</span><span class="blink">&#9613;</span></div>
		`;
		el.innerHTML = html;
	}

	function renderAll(name) {
		const displayName =
			name === "PI" ? "Pi" : name.charAt(0) + name.slice(1).toLowerCase();
		document.querySelectorAll(".banner[data-font]").forEach((el) => {
			el.textContent = renderBanner(el.dataset.font, name);
		});
		document.querySelectorAll("[data-boot]").forEach((el) => {
			renderBoot(el, displayName);
		});
	}

	function bindControls() {
		const buttons = document.querySelectorAll(".controls__btn[data-name]");
		buttons.forEach((btn) => {
			btn.addEventListener("click", () => {
				buttons.forEach((b) => b.setAttribute("aria-pressed", "false"));
				btn.setAttribute("aria-pressed", "true");
				renderAll(btn.dataset.name);
			});
		});
	}

	document.addEventListener("DOMContentLoaded", () => {
		bindControls();
		renderAll("CLAUDE");
	});
})();
