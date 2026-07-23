import { expect, test } from "bun:test";
import { enUSMessages, messages, zhCNMessages } from "./messages";

test("Chinese catalog covers every English message key", () => {
	expect(Object.keys(zhCNMessages).sort()).toEqual(
		Object.keys(enUSMessages).sort(),
	);
});

test("every supported locale has the complete message catalog", () => {
	for (const catalog of Object.values(messages)) {
		expect(Object.keys(catalog).sort()).toEqual(
			Object.keys(enUSMessages).sort(),
		);
	}
});
