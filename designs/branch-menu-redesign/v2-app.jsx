// Mount the three variants inside a DesignCanvas so they can be
// reordered, focused fullscreen, and compared side-by-side.
function App() {
	// The design-canvas background is warm gray by default. We paint the
	// section container transparent so the page tokens (--page-bg) show
	// through and stay in-theme when the user swaps Ember / Zed / Light.
	// The canvas itself still keeps its own workspace grid — that gives
	// artboards a sense of "on canvas" without fighting the theme.
	return (
		<DesignCanvas>
			<DCSection
				id="menu-variants"
				title="Branch Menu · 三种简约方向"
				subtitle="点击右上角 ⇱ 可将任意方向放大对比。拖动左上角 ⋮⋮ 重排。"
			>
				<DCArtboard
					id="va"
					label="A · Editorial hairline"
					width={360}
					height={480}
				>
					<VariantA />
				</DCArtboard>
				<DCArtboard
					id="vb"
					label="B · Command surface"
					width={360}
					height={620}
				>
					<VariantB />
				</DCArtboard>
				<DCArtboard id="vc" label="C · Silent card" width={360} height={620}>
					<VariantC />
				</DCArtboard>
			</DCSection>
		</DesignCanvas>
	);
}

const themeSwitch = document.getElementById("themeSwitch");
themeSwitch?.addEventListener("click", (event) => {
	const target = event.target.closest("[data-theme]");
	if (!target) return;
	const theme = target.getAttribute("data-theme");
	document.documentElement.setAttribute("data-theme", theme);
	themeSwitch.querySelectorAll("button").forEach((b) => {
		b.classList.toggle("is-active", b === target);
	});
});

ReactDOM.createRoot(document.getElementById("canvasRoot")).render(<App />);
