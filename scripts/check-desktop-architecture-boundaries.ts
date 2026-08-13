#!/usr/bin/env bun

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

export type ArchitectureRuleId =
	| "renderer-no-legacy-tabs-store"
	| "renderer-no-react-mosaic"
	| "renderer-no-legacy-terminal-bridge"
	| "panes-workspace-no-cross-feature-deep-import"
	| "catalog-owns-project-workspace-writes";

export interface ArchitectureViolation {
	file: string;
	line: number;
	column: number;
	rule: ArchitectureRuleId;
	message: string;
}

interface ScanOptions {
	root?: string;
	files?: string[];
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const SKIPPED_DIRECTORIES = new Set([
	".git",
	".next",
	".turbo",
	"build",
	"coverage",
	"dist",
	"generated",
	"node_modules",
	"vendor",
]);
const TEST_FILE_PATTERN =
	/(?:^|\/)(?:__tests__|test|tests|fixtures)(?:\/|$)|(?:^|[.-])(?:bench|spec|test|stories)\.(?:ts|tsx|mts|cts)$/;
const GENERATED_FILE_PATTERN = /(?:^|\/)(?:routeTree\.gen|generated)(?:\.|\/)/;
const PANES_WORKSPACE_SEGMENT =
	"/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/PanesWorkspace/";

function normalize(filePath: string): string {
	return filePath.split(path.sep).join("/");
}

function isProductionTypeScript(filePath: string): boolean {
	const normalized = normalize(filePath);
	return (
		SOURCE_EXTENSIONS.has(path.extname(normalized)) &&
		!TEST_FILE_PATTERN.test(normalized) &&
		!GENERATED_FILE_PATTERN.test(normalized)
	);
}

async function collectProductionFiles(root: string): Promise<string[]> {
	const git = Bun.spawn(
		[
			"git",
			"-C",
			root,
			"ls-files",
			"--cached",
			"--others",
			"--exclude-standard",
			"-z",
		],
		{ stdout: "pipe", stderr: "ignore" },
	);
	const gitOutput = await new Response(git.stdout).text();
	if ((await git.exited) === 0) {
		return gitOutput
			.split("\0")
			.filter(isProductionTypeScript)
			.map((file) => path.join(root, file))
			.sort();
	}

	const files: string[] = [];
	async function visit(directory: string): Promise<void> {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)) {
				continue;
			}
			const entryPath = path.join(directory, entry.name);
			if (entry.isDirectory()) await visit(entryPath);
			else if (entry.isFile() && isProductionTypeScript(entryPath))
				files.push(entryPath);
		}
	}

	await visit(root);
	return files.sort();
}

function scriptKind(filePath: string): ts.ScriptKind {
	return filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function location(
	sourceFile: ts.SourceFile,
	node: ts.Node,
): Pick<ArchitectureViolation, "line" | "column"> {
	const point = sourceFile.getLineAndCharacterOfPosition(
		node.getStart(sourceFile),
	);
	return { line: point.line + 1, column: point.character + 1 };
}

function moduleTarget(importer: string, specifier: string): string {
	const importerNormalized = normalize(importer);
	if (specifier.startsWith(".")) {
		return normalize(path.resolve(path.dirname(importer), specifier));
	}
	if (specifier.startsWith("renderer/")) {
		const marker = "/apps/desktop/src/";
		const markerIndex = importerNormalized.indexOf(marker);
		if (markerIndex >= 0) {
			return `${importerNormalized.slice(0, markerIndex + marker.length)}${specifier}`;
		}
	}
	return specifier;
}

function isInsidePanesWorkspace(filePath: string): boolean {
	return normalize(filePath).includes(PANES_WORKSPACE_SEGMENT);
}

function importViolation(
	filePath: string,
	specifier: string,
): { rule: ArchitectureRuleId; message: string } | undefined {
	const normalizedFile = normalize(filePath);
	const isRenderer = normalizedFile.includes("/apps/desktop/src/renderer/");
	const target = moduleTarget(filePath, specifier);

	if (isRenderer) {
		if (
			target.includes("/renderer/stores/tabs/store") ||
			target === "renderer/stores/tabs/store"
		) {
			return {
				rule: "renderer-no-legacy-tabs-store",
				message: `renderer production code imports the legacy tabs store (${specifier})`,
			};
		}
		if (
			specifier === "react-mosaic-component" ||
			specifier.startsWith("react-mosaic-component/")
		) {
			return {
				rule: "renderer-no-react-mosaic",
				message: `renderer production code imports react-mosaic (${specifier})`,
			};
		}
		if (target.includes("/createLegacyTerminalPaneBridge")) {
			return {
				rule: "renderer-no-legacy-terminal-bridge",
				message: `renderer production code imports the legacy terminal bridge (${specifier})`,
			};
		}
	}

	if (
		target.includes(PANES_WORKSPACE_SEGMENT) &&
		!isInsidePanesWorkspace(filePath)
	) {
		return {
			rule: "panes-workspace-no-cross-feature-deep-import",
			message: `code outside PanesWorkspace deep-imports its implementation (${specifier}); use a public feature boundary`,
		};
	}

	return undefined;
}

function schemaEntityName(
	expression: ts.Expression,
	schemaIdentifiers: Map<string, "projects" | "workspaces">,
	schemaNamespaces: Set<string>,
): "projects" | "workspaces" | undefined {
	if (ts.isIdentifier(expression))
		return schemaIdentifiers.get(expression.text);
	if (
		ts.isPropertyAccessExpression(expression) &&
		ts.isIdentifier(expression.expression) &&
		schemaNamespaces.has(expression.expression.text) &&
		(expression.name.text === "projects" ||
			expression.name.text === "workspaces")
	) {
		return expression.name.text;
	}
	if (
		ts.isElementAccessExpression(expression) &&
		ts.isIdentifier(expression.expression) &&
		schemaNamespaces.has(expression.expression.text) &&
		expression.argumentExpression &&
		ts.isStringLiteral(expression.argumentExpression) &&
		(expression.argumentExpression.text === "projects" ||
			expression.argumentExpression.text === "workspaces")
	) {
		return expression.argumentExpression.text;
	}
	return undefined;
}

function drizzleOperation(
	callee: ts.Expression,
	operationAliases: Map<string, "insert" | "update" | "delete">,
): "insert" | "update" | "delete" | undefined {
	if (
		ts.isPropertyAccessExpression(callee) &&
		(callee.name.text === "insert" ||
			callee.name.text === "update" ||
			callee.name.text === "delete")
	) {
		return callee.name.text;
	}
	if (ts.isIdentifier(callee)) return operationAliases.get(callee.text);
	return undefined;
}

function isCatalogWriteOwner(filePath: string): boolean {
	const normalized = normalize(filePath);
	return (
		normalized.includes("/workspace-catalog/") ||
		normalized.endsWith("/workspace-catalog/identity-backfill.ts")
	);
}

export function analyzeSource(
	filePath: string,
	source: string,
): ArchitectureViolation[] {
	const sourceFile = ts.createSourceFile(
		filePath,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKind(filePath),
	);
	const violations: ArchitectureViolation[] = [];
	const schemaIdentifiers = new Map<string, "projects" | "workspaces">();
	const schemaNamespaces = new Set<string>();
	const operationAliases = new Map<string, "insert" | "update" | "delete">();

	for (const statement of sourceFile.statements) {
		const moduleSpecifier =
			ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)
				? statement.moduleSpecifier
				: undefined;
		if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue;
		const specifier = moduleSpecifier.text;
		const found = importViolation(filePath, specifier);
		if (found) {
			violations.push({
				file: filePath,
				...location(sourceFile, moduleSpecifier),
				...found,
			});
		}

		if (
			!ts.isImportDeclaration(statement) ||
			!/(?:^|\/)(?:db\/schema|schema)(?:\.ts)?$/.test(specifier)
		)
			continue;
		const bindings = statement.importClause?.namedBindings;
		if (bindings && ts.isNamespaceImport(bindings)) {
			schemaNamespaces.add(bindings.name.text);
		} else if (bindings && ts.isNamedImports(bindings)) {
			for (const element of bindings.elements) {
				const importedName = element.propertyName?.text ?? element.name.text;
				if (importedName === "projects" || importedName === "workspaces") {
					schemaIdentifiers.set(element.name.text, importedName);
				}
			}
		}
	}

	function visit(node: ts.Node): void {
		if (ts.isVariableDeclaration(node)) {
			if (ts.isObjectBindingPattern(node.name) && node.initializer) {
				for (const element of node.name.elements) {
					const property = element.propertyName ?? element.name;
					if (
						ts.isIdentifier(property) &&
						ts.isIdentifier(element.name) &&
						(property.text === "insert" ||
							property.text === "update" ||
							property.text === "delete")
					) {
						operationAliases.set(element.name.text, property.text);
					}
				}
			} else if (
				ts.isIdentifier(node.name) &&
				node.initializer &&
				ts.isPropertyAccessExpression(node.initializer) &&
				(node.initializer.name.text === "insert" ||
					node.initializer.name.text === "update" ||
					node.initializer.name.text === "delete")
			) {
				operationAliases.set(node.name.text, node.initializer.name.text);
			}
		}

		if (ts.isCallExpression(node)) {
			if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
				const argument = node.arguments[0];
				if (argument && ts.isStringLiteral(argument)) {
					const found = importViolation(filePath, argument.text);
					if (found) {
						violations.push({
							file: filePath,
							...location(sourceFile, argument),
							...found,
						});
					}
				}
			}

			const operation = drizzleOperation(node.expression, operationAliases);
			const entity = node.arguments[0]
				? schemaEntityName(
						node.arguments[0],
						schemaIdentifiers,
						schemaNamespaces,
					)
				: undefined;
			if (operation && entity && !isCatalogWriteOwner(filePath)) {
				violations.push({
					file: filePath,
					...location(sourceFile, node),
					rule: "catalog-owns-project-workspace-writes",
					message: `direct Drizzle ${operation}(${entity}) is outside workspace-catalog ownership`,
				});
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);

	return violations;
}

export async function scanArchitectureBoundaries(
	options: ScanOptions = {},
): Promise<ArchitectureViolation[]> {
	const root = path.resolve(options.root ?? path.join(import.meta.dir, ".."));
	const collectedFiles = options.files === undefined;
	const files =
		options.files?.map((file) => path.resolve(root, file)) ??
		(await collectProductionFiles(root));
	const violations: ArchitectureViolation[] = [];
	for (const file of files) {
		if (!isProductionTypeScript(file)) continue;
		try {
			violations.push(...analyzeSource(file, await readFile(file, "utf8")));
		} catch (error) {
			if (
				!collectedFiles ||
				!(error instanceof Error) ||
				!("code" in error) ||
				error.code !== "ENOENT"
			) {
				throw error;
			}
		}
	}
	return violations.sort(
		(a, b) =>
			a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
	);
}

function parseCliArguments(args: string[]): {
	enforce: boolean;
	root?: string;
} {
	let enforce = false;
	let root: string | undefined;
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--enforce") enforce = true;
		else if (argument === "--report") enforce = false;
		else if (argument === "--root") root = args[++index];
		else if (argument === "--help" || argument === "-h") {
			console.log(
				"Usage: bun scripts/check-desktop-architecture-boundaries.ts [--report|--enforce] [--root PATH]",
			);
			process.exit(0);
		} else throw new Error(`Unknown argument: ${argument}`);
	}
	return { enforce, root };
}

export async function runCli(args = process.argv.slice(2)): Promise<number> {
	const { enforce, root } = parseCliArguments(args);
	const scanRoot = path.resolve(root ?? path.join(import.meta.dir, ".."));
	const violations = await scanArchitectureBoundaries({ root: scanRoot });
	for (const violation of violations) {
		console.log(
			`${normalize(path.relative(scanRoot, violation.file))}:${violation.line}:${violation.column} [${violation.rule}] ${violation.message}`,
		);
	}
	const mode = enforce ? "enforce" : "report";
	console.log(
		`\nDesktop architecture boundary check (${mode}): ${violations.length} violation${violations.length === 1 ? "" : "s"}.`,
	);
	if (!enforce && violations.length > 0) {
		console.log("Baseline report only; pass --enforce to exit nonzero.");
	}
	return enforce && violations.length > 0 ? 1 : 0;
}

if (import.meta.main) process.exit(await runCli());
