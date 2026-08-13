import { readFile, writeFile } from "node:fs/promises";

const appRoot = new URL("../", import.meta.url);
const outputDirectory = new URL("dist-automate/", appRoot);
const assetBase = "/webapp/16740/assets/";
const pairingPathPlaceholder = "__AUTOMATE_PAIRING_PATH__";
const routeBootstrap = `<script>if(!location.hash)history.replaceState(null,"",${JSON.stringify(pairingPathPlaceholder)});</script>`;

function assetFileUrl(assetUrl) {
	if (!assetUrl.startsWith(assetBase)) {
		throw new Error(`Expected an AutoMate asset URL, received ${assetUrl}`);
	}

	const fileName = assetUrl.slice(assetBase.length);
	if (
		!fileName ||
		fileName.includes("/") ||
		fileName.includes("?") ||
		fileName.includes("#")
	) {
		throw new Error(`Invalid AutoMate asset URL: ${assetUrl}`);
	}

	return new URL(`assets/${fileName}`, outputDirectory);
}

function escapeInlineTagContent(content, tagName) {
	return content.replaceAll(`</${tagName}`, `<\\/${tagName}`);
}

async function inlineStylesheet(tag) {
	const href = tag.match(/\bhref="([^"]+)"/)?.[1];
	if (!href) {
		throw new Error(`Stylesheet tag is missing an href: ${tag}`);
	}

	const stylesheet = await readFile(assetFileUrl(href), "utf8");
	return `<style>${escapeInlineTagContent(stylesheet, "style")}</style>`;
}

async function inlineModuleScript(tag) {
	const src = tag.match(/\bsrc="([^"]+)"/)?.[1];
	if (!src) {
		throw new Error(`Module script tag is missing a src: ${tag}`);
	}

	const script = await readFile(assetFileUrl(src), "utf8");
	return `<script type="module">${escapeInlineTagContent(script, "script")}</script>`;
}

async function replaceAsync(source, pattern, replacement) {
	const matches = [...source.matchAll(pattern)];
	const replacements = await Promise.all(
		matches.map((match) => replacement(match[0])),
	);

	return matches.reduceRight(
		(result, match, index) =>
			`${result.slice(0, match.index)}${replacements[index]}${result.slice(
				match.index + match[0].length,
			)}`,
		source,
	);
}

let html = await readFile(new URL("index.html", outputDirectory), "utf8");
html = await replaceAsync(
	html,
	/<link\b(?=[^>]*\brel="stylesheet")[^>]*>/g,
	inlineStylesheet,
);
html = await replaceAsync(
	html,
	/<script\b(?=[^>]*\btype="module")[^>]*><\/script>/g,
	async (tag) => `${routeBootstrap}${await inlineModuleScript(tag)}`,
);

if (html.includes(assetBase)) {
	throw new Error("AutoMate task HTML still references Vite assets");
}

const taskSource = `const wire=$0||{};
const route=typeof wire.route==="string"?wire.route:"";
const match=/^\\/pair\\/([^/?#]+)\\/([^/?#]+)$/.exec(route);
let pairingPath="/webapp/16740#/pair";
if(match){try{const code=decodeURIComponent(match[1]);const mailboxId=decodeURIComponent(match[2]);if(code&&mailboxId){pairingPath="/webapp/16740#/pair/"+encodeURIComponent(code)+"/"+encodeURIComponent(mailboxId)}}catch{}}
const html=${JSON.stringify(html)}.replace(${JSON.stringify(pairingPathPlaceholder)},pairingPath);
am.return({command:"html",data:{html}});
`;
await writeFile(new URL("task.js", outputDirectory), taskSource);
