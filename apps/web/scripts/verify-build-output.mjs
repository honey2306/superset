import { readFile } from "node:fs/promises";

const appRoot = new URL("../", import.meta.url);

async function verifyAssetBase(outputDirectory, expectedBase) {
	const indexPath = new URL(`${outputDirectory}/index.html`, appRoot);
	const indexHtml = await readFile(indexPath, "utf8");
	const assetUrls = [
		...indexHtml.matchAll(
			/(?:href|src)="([^"?]*\/assets\/[^"?]+)(?:\?[^"]*)?"/g,
		),
	].map((match) => match[1]);

	if (assetUrls.length === 0) {
		throw new Error(
			`${indexPath.pathname} does not reference any built assets`,
		);
	}

	const unexpectedAssetUrls = assetUrls.filter(
		(assetUrl) => !assetUrl.startsWith(expectedBase),
	);
	if (unexpectedAssetUrls.length > 0) {
		throw new Error(
			`${indexPath.pathname} has assets outside ${expectedBase}: ${unexpectedAssetUrls.join(", ")}`,
		);
	}
}

async function verifyAutoMateTask() {
	const task = await readFile(
		new URL("dist-automate/task.js", appRoot),
		"utf8",
	);

	if (!task.includes('am.return({command:"html",data:{html}});')) {
		throw new Error("AutoMate task does not return an HTML command");
	}

	if (task.includes("/webapp/16740/assets/")) {
		throw new Error("AutoMate task still references Vite assets");
	}

	if (/<(?:script|link)\b[^>]*\b(?:src|href)=/.test(task)) {
		throw new Error(
			"AutoMate task still contains external script or stylesheet tags",
		);
	}

	if (!task.includes("wss:")) {
		throw new Error("AutoMate task does not include the relay URL");
	}

	if (!task.includes("react.transitional.element")) {
		throw new Error("AutoMate task does not include the React bundle");
	}

	const taskInputStart = task.indexOf("const wire=$0||{};");
	const taskReturnStart = task.indexOf("am.return(");
	if (taskInputStart < 0 || taskInputStart > taskReturnStart) {
		throw new Error("AutoMate task must read task input before returning HTML");
	}

	if (!task.includes("history.replaceState")) {
		throw new Error("AutoMate task does not restore its route");
	}

	if (
		!task.includes('pairingPath="/webapp/16740#/pair"') ||
		!task.includes("if(!location.hash)")
	) {
		throw new Error(
			"AutoMate task does not preserve an existing resume fragment",
		);
	}

	const reactModuleStart = '<script type=\\"module\\">';
	const routeBootstrapStart = task.indexOf("history.replaceState");
	if (
		routeBootstrapStart < 0 ||
		routeBootstrapStart > task.indexOf(reactModuleStart)
	) {
		throw new Error(
			"AutoMate route bootstrap must run before the React module",
		);
	}

	if (
		task
			.slice(
				routeBootstrapStart,
				task.indexOf("</script>", routeBootstrapStart),
			)
			.includes("$0")
	) {
		throw new Error("AutoMate browser bootstrap must not access task input");
	}
}

await verifyAssetBase("../../packages/host-service/public/web", "/app/assets/");
await verifyAssetBase("dist-automate", "/webapp/16740/assets/");
await verifyAutoMateTask();
