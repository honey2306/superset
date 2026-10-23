/** Snapshot the public router's structural wire types without server imports.
 * --check compares the snapshot without writing it. No Host process is started.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve(import.meta.dir, "..");
const configFile = ts.readConfigFile(
	path.join(root, "tsconfig.json"),
	ts.sys.readFile,
);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const program = ts.createProgram(config.fileNames, config.options);
const diagnostics = ts.getPreEmitDiagnostics(program);
if (diagnostics.length)
	throw new Error(
		ts.formatDiagnosticsWithColorAndContext(diagnostics, {
			getCanonicalFileName: (file) => file,
			getCurrentDirectory: () => root,
			getNewLine: () => "\n",
		}),
	);
const checker = program.getTypeChecker();
const source = program.getSourceFile(
	path.join(root, "src/trpc/router/router.ts"),
);
if (!source) throw new Error("Host router source not found");
const declaration = source.statements.find(
	(node): node is ts.TypeAliasDeclaration =>
		ts.isTypeAliasDeclaration(node) && node.name.text === "AppRouter",
);
if (!declaration) throw new Error("AppRouter export not found");
const router = checker.getTypeAtLocation(declaration);
function required<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("Incomplete router type");
	return value;
}
function member(type: ts.Type, name: string): ts.Type {
	const property = type.getProperty(name);
	if (!property)
		throw new Error(`Missing ${name} on ${checker.typeToString(type)}`);
	return checker.getTypeOfSymbolAtLocation(property, declaration);
}

const aliases = new Map<ts.Type, string>();
const declarations: string[] = [];
const counts = new Map<string, number>();
function uniqueName(hint: string) {
	const base = hint.replace(/[^A-Za-z0-9_]/g, "_");
	const count = (counts.get(base) ?? 0) + 1;
	counts.set(base, count);
	return count === 1 ? base : `${base}_${count}`;
}
function shape(type: ts.Type, hint: string): string {
	if (type.flags & ts.TypeFlags.Any) return "unknown";
	if (type.isUnion()) return type.types.map((t) => shape(t, hint)).join(" | ");
	if (type.isIntersection())
		return type.types.map((t) => `(${shape(t, hint)})`).join(" & ");
	if (!(type.flags & ts.TypeFlags.Object))
		return checker.typeToString(
			type,
			undefined,
			ts.TypeFormatFlags.NoTruncation,
		);
	const name = type.getSymbol()?.getName();
	if (name === "Date") return "Date";
	if (checker.isArrayType(type))
		return `Array<${shape(required(checker.getTypeArguments(type as ts.TypeReference)[0]), `${hint}Item`)}>`;
	if (checker.isTupleType(type)) {
		const reference = type as ts.TypeReference;
		const flags = (reference.target as ts.TupleType).elementFlags;
		return `[${checker
			.getTypeArguments(reference)
			.map((t, i) => {
				const value = shape(t, `${hint}Item`);
				return required(flags[i]) & ts.ElementFlags.Rest
					? `...Array<${value}>`
					: required(flags[i]) & ts.ElementFlags.Optional
						? `(${value})?`
						: value;
			})
			.join(", ")}]`;
	}
	if (
		name &&
		[
			"Map",
			"Set",
			"ReadonlyMap",
			"ReadonlySet",
			"AsyncIterable",
			"AsyncGenerator",
			"Promise",
		].includes(name)
	)
		return `${name}<${checker
			.getTypeArguments(type as ts.TypeReference)
			.map((t) => shape(t, `${hint}Value`))
			.join(", ")}>`;
	const known = aliases.get(type);
	if (known) return known;
	if (type.getCallSignatures().length)
		throw new Error(`Non-wire function at ${hint}`);
	const alias = uniqueName(hint);
	aliases.set(type, alias);
	const properties = type.getProperties().map((property) => {
		const value = checker.getTypeOfSymbolAtLocation(property, declaration);
		return `${JSON.stringify(property.name)}${property.flags & ts.SymbolFlags.Optional ? "?" : ""}: ${shape(value, `${alias}_${property.name}`)};`;
	});
	for (const index of checker.getIndexInfosOfType(type)) {
		properties.push(
			`[key: ${shape(index.keyType, `${alias}Key`)}]: ${shape(index.type, `${alias}Value`)};`,
		);
	}
	declarations.push(`export type ${alias} = {\n${properties.join("\n")}\n};`);
	return alias;
}

let procedureCount = 0;
function record(type: ts.Type, prefix: string): string {
	return `{\n${type
		.getProperties()
		.map((property) => {
			const value = checker.getTypeOfSymbolAtLocation(property, declaration);
			const hint = `${prefix}_${property.name}`;
			const def = value.getProperty("_def");
			if (!def)
				return `${JSON.stringify(property.name)}: ${record(value, hint)};`;
			const definition = member(value, "_def");
			if (!definition.getProperty("procedure"))
				return `${JSON.stringify(property.name)}: ${record(member(definition, "record"), hint)};`;
			const kind = checker
				.typeToString(member(definition, "type"))
				.replaceAll('"', "");
			if (kind !== "query" && kind !== "mutation" && kind !== "subscription")
				throw new Error(`Unknown procedure kind: ${kind}`);
			const wire = member(definition, "$types");
			const input = shape(member(wire, "input"), `${hint}Input`);
			const output = shape(member(wire, "output"), `${hint}Output`);
			procedureCount++;
			return `${JSON.stringify(property.name)}: ${kind === "query" ? "Query" : kind === "mutation" ? "Mutation" : "Subscription"}<{ input: ${input}; output: ${output}; meta: unknown }>;`;
		})
		.join("\n")}\n}`;
}
const definition = member(router, "_def");
const procedures = record(member(definition, "record"), "Host");
const errorShape = shape(
	member(member(member(definition, "_config"), "$types"), "errorShape"),
	"HostErrorShape",
);
const rawOutput = `// Generated by host-service/scripts/generate-client-contract.ts. Do not edit.\n// Structural wire contract only: no Host runtime, database or Node dependencies.\nimport type { TRPCBuiltRouter, TRPCQueryProcedure as Query, TRPCMutationProcedure as Mutation, TRPCSubscriptionProcedure as Subscription } from "@trpc/server";\n\nexport type AppRouter = TRPCBuiltRouter<{ ctx: object; meta: unknown; errorShape: ${errorShape}; transformer: true }, ${procedures}>;\n\n${declarations.join("\n\n")}\n`;
const target = path.resolve(root, "../host-contract/src/router.generated.ts");
const formatted = Bun.spawnSync(
	[
		path.join(root, "../../node_modules/.bin/biome"),
		"check",
		"--write",
		"--unsafe",
		"--stdin-file-path",
		target,
	],
	{
		stdin: new TextEncoder().encode(rawOutput),
		stdout: "pipe",
		stderr: "pipe",
	},
);
if (formatted.exitCode !== 0)
	throw new Error(new TextDecoder().decode(formatted.stderr));
const output = new TextDecoder().decode(formatted.stdout);
if (process.argv.includes("--check")) {
	if (readFileSync(target, "utf8") !== output)
		throw new Error(
			"Host contract is stale; run bun run --cwd packages/host-service generate:contract",
		);
} else writeFileSync(target, output);
console.log(
	`Host contract: ${procedureCount} procedures, ${aliases.size} portable shapes`,
);
