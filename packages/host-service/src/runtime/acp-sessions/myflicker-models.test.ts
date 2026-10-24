import { afterEach, expect, test } from "bun:test";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	initializeMyFlickerSdkModel,
	MYFLICKER_MODEL_CONFIG_ID,
	type MyFlickerModelContext,
	MyFlickerModelSelectionError,
	MyFlickerModels,
	myFlickerModelOption,
	withMyFlickerModel,
} from "./myflicker-models";

const directories: string[] = [];
afterEach(() => {
	for (const dir of directories.splice(0))
		rmSync(dir, { recursive: true, force: true });
});
function fixture() {
	const cwd = mkdtempSync(path.join(tmpdir(), "mf-models-test-"));
	directories.push(cwd);
	const command = path.join(cwd, "mf");
	const log = path.join(cwd, "calls.jsonl");
	writeFileSync(
		command,
		`#!${process.execPath}
import {appendFileSync} from "node:fs";
import {createInterface} from "node:readline";
const args = process.argv.slice(2);
const log = value => appendFileSync(process.env.CALL_LOG, JSON.stringify(value) + "\\n");
log({args});
if (args.includes("sdk-server")) {
 console.log(JSON.stringify({jsonrpc:"2.0",method:"sdk::ready",params:{}}));
 createInterface({input:process.stdin}).on("line", line => {
  const req=JSON.parse(line);log(req);
  if(process.env.SDK_CRASH)process.exit(2);
  console.log(JSON.stringify({jsonrpc:"2.0",id:req.id,...process.env.SDK_FAIL?{error:{message:"SENTINEL-SECRET"}}:{result:{success:true}}}));
 });
} else if (args[0] === "call") {
 if(process.env.CATALOG_FAIL){console.error("SENTINEL-SECRET");process.exit(1);}
 const model=args[args.indexOf("--model")+1];
 const provider={id:"custom",hasApiKey:true,options:{apiKey:"SENTINEL-SECRET"}};
 const data=args[1]==="providers.list"?{providers:[provider,{id:"no-key",hasApiKey:false}]}:{groupedModels:[{providerId:"custom",models:[{value:"custom/a",name:"Model A"},{value:"custom/b",name:"Model B"},{value:"custom/c",name:"Model C"}]},{providerId:"no-key",models:[{value:"no-key/a",name:"Hidden"}]}],currentModel:{provider,model:{id:args.includes("--model")?model.split("/")[1]:"a",apiFormat:model==="custom/b"?"anthropic":model==="custom/c"?"openai":"responses"}}};
 console.log(JSON.stringify({success:true,data}));
}
`,
	);
	chmodSync(command, 0o755);
	const context: MyFlickerModelContext = {
		command,
		cwd,
		backend: "codex",
		env: { ...process.env, CALL_LOG: log },
	};
	return {
		context,
		log,
		calls: () =>
			readFileSync(log, "utf8")
				.trim()
				.split("\n")
				.map((line) => JSON.parse(line)),
	};
}

test("discovers authenticated models using real metadata, not names; caches only safe results", async () => {
	const f = fixture();
	const service = new MyFlickerModels();
	expect(await service.list(f.context)).toEqual([
		{ id: "custom/a", name: "custom / Model A" },
	]);
	const count = f.calls().length;
	await service.list(f.context);
	expect(f.calls()).toHaveLength(count);
	expect(await service.list({ ...f.context, backend: "claude" })).toEqual([
		{ id: "custom/b", name: "custom / Model B" },
	]);
	expect(JSON.stringify(await service.list(f.context))).not.toContain(
		"SENTINEL-SECRET",
	);
});

test("discovery failures do not leak CLI credentials or poison the cache", async () => {
	const f = fixture();
	const service = new MyFlickerModels();
	f.context.env.CATALOG_FAIL = "1";
	await expect(service.list(f.context)).rejects.toThrow(
		"mf model discovery failed",
	);
	delete f.context.env.CATALOG_FAIL;
	expect(await service.list(f.context)).toHaveLength(1);
});

test("uses an explicit SDK resume override, without a prompt or global config write", async () => {
	const f = fixture();
	await initializeMyFlickerSdkModel({
		...f.context,
		sessionId: "native-existing",
		modelId: "custom/a",
	});
	expect(f.calls()).toEqual([
		{ args: ["--backend", "codex", "--approval-mode", "yolo", "sdk-server"] },
		{
			jsonrpc: "2.0",
			id: 1,
			method: "session::init",
			params: {
				cwd: f.context.cwd,
				sessionId: "native-existing",
				source: "resume",
				productName: "myflicker",
				configProductName: "myflicker",
				model: "custom/a",
				skills: [],
			},
		},
	]);
});

test("selection persists only the canonical session model after releasing its SDK lease", async () => {
	const f = fixture();
	const service = new MyFlickerModels();
	await service.select({
		...f.context,
		sessionId: "native-existing",
		modelId: "custom/a",
	});
	expect(f.calls().at(-1)).toEqual({
		args: [
			"call",
			"session.setModel",
			"--model",
			"custom/a",
			"--sessionId",
			"native-existing",
		],
	});
	expect(f.calls()).toHaveLength(3);
});

test("a canonical persistence failure after SDK init is explicitly uncertain, not a success", async () => {
	const f = fixture();
	f.context.env.CATALOG_FAIL = "1";
	await expect(
		new MyFlickerModels().select({
			...f.context,
			sessionId: "native-existing",
			modelId: "custom/a",
		}),
	).rejects.toBeInstanceOf(MyFlickerModelSelectionError);
});

test("a missing SDK executable rejects without an unhandled pipe error", async () => {
	const f = fixture();
	await expect(
		initializeMyFlickerSdkModel({
			...f.context,
			command: path.join(f.context.cwd, "missing-mf"),
			sessionId: "native-existing",
			modelId: "custom/a",
		}),
	).rejects.toThrow("Could not start");
});

test("SDK errors and early exit reject model changes without exposing raw diagnostics", async () => {
	const f = fixture();
	f.context.env.SDK_FAIL = "1";
	await expect(
		initializeMyFlickerSdkModel({
			...f.context,
			sessionId: "native-existing",
			modelId: "custom/a",
		}),
	).rejects.toThrow("SDK rejected");
	delete f.context.env.SDK_FAIL;
	f.context.env.SDK_CRASH = "1";
	await expect(
		initializeMyFlickerSdkModel({
			...f.context,
			sessionId: "native-existing",
			modelId: "custom/a",
		}),
	).rejects.toThrow("before confirming");
});

test("native model controls take precedence when mf fixes its ACP implementation", () => {
	const fallback = myFlickerModelOption(
		[{ id: "custom/a", name: "A" }],
		"custom/a",
	);
	const native = { ...fallback, id: "model" };
	expect(withMyFlickerModel([native, fallback], fallback)).toEqual([native]);
	expect(withMyFlickerModel([], fallback)).toEqual([fallback]);
	expect(fallback.id).toBe(MYFLICKER_MODEL_CONFIG_ID);
});
